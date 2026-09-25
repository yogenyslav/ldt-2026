package server

import (
	"errors"
	"net"
	"os"
	"os/signal"
	"syscall"

	"github.com/grpc-ecosystem/go-grpc-middleware/v2/interceptors/logging"
	"github.com/yogenyslav/errs"
	"github.com/yogenyslav/ldt-2026/dicom-worker/pkg/observability"
	"go.opentelemetry.io/contrib/instrumentation/google.golang.org/grpc/otelgrpc"
	"google.golang.org/grpc"
)

var (
	// ErrServicePortNotSet ошибка, если переменная окружения SERVICE_PORT не установлена.
	ErrServicePortNotSet = errors.New("SERVICE_PORT environment variable is not set")
)

// Server сервер приложения.
type Server struct {
	srv *grpc.Server
	obs *observability.Observability
}

// New создает новый экземпляр сервера.
func New(obs *observability.Observability) (*Server, error) {
	logOpts := []logging.Option{
		logging.WithLogOnEvents(logging.StartCall), logging.WithLogOnEvents(logging.FinishCall),
	}

	grpcOpts := []grpc.ServerOption{
		grpc.ChainUnaryInterceptor(
			logging.UnaryServerInterceptor(LoggerInterceptor(obs.Logger()), logOpts...),
		),
		grpc.StatsHandler(otelgrpc.NewServerHandler(otelgrpc.WithTracerProvider(obs.Tracing().Provider()))),
	}
	srv := grpc.NewServer(grpcOpts...)

	return &Server{
		srv: srv,
		obs: obs,
	}, nil
}

// Serve запускает gRPC сервер.
func (s *Server) Serve() error {
	port, ok := os.LookupEnv("DICOM_WORKER_PORT")
	if !ok {
		return errs.Wrap(ErrServicePortNotSet, "service port is required to start server")
	}

	defer s.srv.GracefulStop()

	s.obs.Logger().Info().Str("port", port).Msg("gRPC server is starting")

	errCh := make(chan error, 1)
	stopCh := make(chan os.Signal, 1)
	signal.Notify(stopCh, syscall.SIGINT, syscall.SIGTERM)

	go s.listenGrpc(port, errCh)

	select {
	case <-stopCh:
		s.obs.Logger().Info().Msg("received stop signal, shutting down server")
		return nil
	case err := <-errCh:
		return errs.Wrap(err, "gRPC server error")
	}
}

func (s *Server) listenGrpc(port string, errCh chan error) {
	lis, err := net.Listen("tcp", net.JoinHostPort("", port))
	if err != nil {
		errCh <- errs.Wrap(err, "create net listener")
		return
	}

	if err = s.srv.Serve(lis); err != nil {
		errCh <- errs.Wrap(err, "serve gRPC server")
		return
	}
}

// GRPCServer возвращает экземпляр gRPC сервера.
func (s *Server) GRPCServer() *grpc.Server {
	return s.srv
}
