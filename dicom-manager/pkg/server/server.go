package server

import (
	"errors"
	"net"
	"os"
	"os/signal"
	"syscall"

	"github.com/gofiber/contrib/v3/otel"
	"github.com/gofiber/contrib/v3/swaggo"
	"github.com/gofiber/contrib/v3/zerolog"
	"github.com/gofiber/fiber/v3"
	recoverer "github.com/gofiber/fiber/v3/middleware/recover"
	"github.com/ilyakaznacheev/cleanenv"
	"github.com/yogenyslav/errs"
	_ "github.com/yogenyslav/ldt-2026/dicom-manager/docs"
	"github.com/yogenyslav/ldt-2026/dicom-manager/pkg/jwt"
	"github.com/yogenyslav/ldt-2026/dicom-manager/pkg/observability"
)

var (
	// ErrServicePortNotSet ошибка, если переменная окружения SERVICE_PORT не установлена.
	ErrServicePortNotSet = errors.New("SERVICE_PORT environment variable is not set")
)

const (
	defaultBodyLimit = 500 * 1024 * 1024 // 500 MB
)

// Server сервер приложения.
type Server struct {
	srv         *fiber.App
	obs         *observability.Observability
	jwtProvider *jwt.Provider
}

// New создает новый экземпляр сервера.
func New(obs *observability.Observability) (*Server, error) {
	var jwtConfig jwt.Config
	if err := cleanenv.ReadEnv(&jwtConfig); err != nil {
		return nil, errs.Wrap(err, "parse jwt config from env")
	}
	jwtProvider := jwt.New(jwtConfig)

	appName, ok := os.LookupEnv("APP_NAME")
	if !ok {
		return nil, errs.Wrap(ErrServicePortNotSet, "app name is required to start server")
	}

	srv := fiber.New(
		fiber.Config{
			BodyLimit: defaultBodyLimit,
			AppName:   appName,
		},
	)

	srv.Use(
		otel.Middleware(otel.WithTracerProvider(obs.Tracing().Provider())),
		zerolog.New(zerolog.Config{Logger: obs.Logger()}),
		recoverer.New(),
	)
	srv.Get("/swagger/*", swaggo.HandlerDefault)
	srv.Get(
		"/docs/*", swaggo.New(
			swaggo.Config{
				Title: "DICOM Manager API",
			},
		),
	)

	return &Server{
		srv:         srv,
		obs:         obs,
		jwtProvider: jwtProvider,
	}, nil
}

// Serve запускает HTTP сервер.
func (s *Server) Serve() error {
	port, ok := os.LookupEnv("DICOM_WORKER_PORT")
	if !ok {
		return errs.Wrap(ErrServicePortNotSet, "service port is required to start server")
	}

	defer func() {
		shutdownErr := s.srv.Shutdown()
		if shutdownErr != nil {
			s.obs.Logger().Err(shutdownErr).Msg("failed to shutdown http server")
		}
	}()

	s.obs.Logger().Info().Str("port", port).Msg("http server is starting")

	errCh := make(chan error, 1)
	stopCh := make(chan os.Signal, 1)
	signal.Notify(stopCh, syscall.SIGINT, syscall.SIGTERM)

	go s.listenHTTP(port, errCh)

	select {
	case <-stopCh:
		s.obs.Logger().Info().Msg("received stop signal, shutting down server")
		return nil
	case err := <-errCh:
		return errs.Wrap(err, "http server error")
	}
}

func (s *Server) listenHTTP(port string, errCh chan error) {
	addr := net.JoinHostPort("", port)
	if err := s.srv.Listen(addr); err != nil {
		errCh <- errs.Wrap(err, "serve http server")
		return
	}
}
