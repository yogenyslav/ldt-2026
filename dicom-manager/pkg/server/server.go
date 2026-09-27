package server

import (
	"errors"
	"fmt"
	"net"
	"os"
	"os/signal"
	"syscall"

	"github.com/gofiber/contrib/v3/otel"
	"github.com/gofiber/contrib/v3/swaggo"
	"github.com/gofiber/contrib/v3/zerolog"
	"github.com/gofiber/fiber/v3"
	recoverer "github.com/gofiber/fiber/v3/middleware/recover"
	jwtv5 "github.com/golang-jwt/jwt/v5"
	_ "github.com/yogenyslav/ldt-2026/dicom-manager/docs"
	"github.com/yogenyslav/ldt-2026/dicom-manager/pkg/observability"
)

var (
	// ErrServicePortNotSet ошибка, если переменная окружения SERVICE_PORT не установлена.
	ErrServicePortNotSet = errors.New("SERVICE_PORT environment variable is not set")
)

const (
	defaultBodyLimit = 500 * 1024 * 1024 // 500 MB
)

// JwtProvider интерфейс для работы с JWT токенами.
type JwtProvider interface {
	CreateAccessToken(userID int64, role string, organizationID int64) (string, error)
	ParseAccessToken(accessTokenString string) (*jwtv5.Token, error)
}

// Server сервер приложения.
type Server struct {
	srv         *fiber.App
	obs         *observability.Observability
	jwtProvider JwtProvider
}

// New создает новый экземпляр сервера.
func New(obs *observability.Observability, jwt JwtProvider) (*Server, error) {
	appName, ok := os.LookupEnv("APP_NAME")
	if !ok {
		return nil, fmt.Errorf("app name is required for server: %v", observability.ErrAppNameNotSet)
	}

	srv := fiber.New(
		fiber.Config{
			BodyLimit:    defaultBodyLimit,
			AppName:      appName,
			ErrorHandler: errorHandler,
		},
	)

	srv.Use(
		otel.Middleware(otel.WithTracerProvider(obs.Tracing().Provider())),
		zerolog.New(zerolog.Config{Logger: obs.Logger()}),
		recoverer.New(),
		MetricsMiddleware(obs.Metrics()),
	)
	srv.Get("/swagger/*", swaggo.HandlerDefault)
	srv.Get(
		"/docs/*", swaggo.New(
			swaggo.Config{
				Title: fmt.Sprintf("%s API Documentation", appName),
			},
		),
	)

	return &Server{
		srv:         srv,
		obs:         obs,
		jwtProvider: jwt,
	}, nil
}

// Serve запускает HTTP сервер.
func (s *Server) Serve() error {
	port, ok := os.LookupEnv("DICOM_MANAGER_PORT")
	if !ok {
		return fmt.Errorf("service port is required for server: %v", ErrServicePortNotSet)
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
		return fmt.Errorf("http server error: %w", err)
	}
}

// Router возвращает роутер по имени.
func (s *Server) Router(name string) fiber.Router {
	return s.srv.Group(name)
}

// UseMiddleware добавляет миддлварь в сервер.
func (s *Server) UseMiddleware(middleware ...fiber.Handler) {
	for _, m := range middleware {
		s.srv.Use(m)
	}
}

func (s *Server) listenHTTP(port string, errCh chan error) {
	addr := net.JoinHostPort("", port)
	if err := s.srv.Listen(addr); err != nil {
		errCh <- fmt.Errorf("failed to listen on %s: %v", addr, err)
		return
	}
}
