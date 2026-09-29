package orthanc

import (
	"context"
	"fmt"
	"net"
	"net/http"

	"github.com/ilyakaznacheev/cleanenv"
	"github.com/yogenyslav/ldt-2026/dicom-manager/internal/generated/orthanc"
)

// Config конфигурация подключения к Orthanc.
type Config struct {
	Password string `env:"ORTHANC_PASSWORD"`
	Host     string `env:"ORTHANC_HOST"`
	Port     string `env:"ORTHANC_PORT"`
}

// Orthanc структура для взаимодействия с Orthanc API.
type Orthanc struct {
	client *orthanc.ClientWithResponses
}

// New создает новый экземпляр Orthanc.
func New() (*Orthanc, error) {
	var cfg Config
	if err := cleanenv.ReadEnv(&cfg); err != nil {
		return nil, fmt.Errorf("read orthanc config from env: %w", err)
	}

	addr := "http://" + net.JoinHostPort(cfg.Host, cfg.Port)
	client, err := orthanc.NewClientWithResponses(
		addr, orthanc.WithRequestEditorFn(authorizationHeader(cfg.Password)),
		orthanc.WithHTTPClient(&retryClient{client: http.DefaultClient}),
	)
	if err != nil {
		return nil, fmt.Errorf("create orthanc client: %w", err)
	}

	return &Orthanc{client: client}, nil
}

// Client возвращает клиент для взаимодействия с Orthanc API.
func (o *Orthanc) Client() orthanc.ClientInterface {
	return o.client
}

func authorizationHeader(password string) orthanc.RequestEditorFn {
	return func(ctx context.Context, req *http.Request) error {
		// autoroute.lua распознаёт синхронизацию manager по имени пользователя.
		// Общие ORTHANC_NAME/ORTHANC_TOKEN могут принадлежать внешнему загрузчику.
		req.SetBasicAuth("dicom-manager", password)
		return nil
	}
}
