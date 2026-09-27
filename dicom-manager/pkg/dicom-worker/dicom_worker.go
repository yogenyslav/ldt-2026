package dicom_worker

import (
	"fmt"
	"net"

	"github.com/ilyakaznacheev/cleanenv"
	dicom_worker "github.com/yogenyslav/ldt-2026/dicom-manager/internal/generated/dicom-worker"
	"github.com/yogenyslav/ldt-2026/dicom-manager/pkg/observability"
	"go.opentelemetry.io/contrib/instrumentation/google.golang.org/grpc/otelgrpc"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
)

// Config конфигурация для подключения к DICOM-воркеру.
type Config struct {
	Host string `env:"DICOM_WORKER_HOST"`
	Port string `env:"DICOM_WORKER_PORT"`
}

// DicomWorkerClient структура клиента для взаимодействия с DICOM-воркером.
type DicomWorkerClient struct {
	conn   *grpc.ClientConn
	client dicom_worker.DicomWorkerServiceClient
}

// New создает новый экземпляр DicomWorkerClient.
func New(obs *observability.Observability) (*DicomWorkerClient, error) {
	var cfg Config
	if err := cleanenv.ReadEnv(&cfg); err != nil {
		return nil, fmt.Errorf("read dicom worker config from env: %w", err)
	}

	addr := net.JoinHostPort(cfg.Host, cfg.Port)
	conn, err := grpc.NewClient(
		addr,
		grpc.WithTransportCredentials(insecure.NewCredentials()),
		grpc.WithStatsHandler(otelgrpc.NewClientHandler(otelgrpc.WithTracerProvider(obs.Tracing().Provider()))),
	)
	if err != nil {
		return nil, fmt.Errorf("create grpc connection: %w", err)
	}

	return &DicomWorkerClient{
		conn:   conn,
		client: dicom_worker.NewDicomWorkerServiceClient(conn),
	}, nil
}

// Client возвращает клиент для взаимодействия с DICOM-воркером.
func (c *DicomWorkerClient) Client() dicom_worker.DicomWorkerServiceClient {
	return c.client
}

// Close закрывает соединение с DICOM-воркером.
func (c *DicomWorkerClient) Close() error {
	return c.conn.Close()
}
