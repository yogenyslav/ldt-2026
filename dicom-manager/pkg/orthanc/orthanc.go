package orthanc

import (
	"context"
	"encoding/base64"
	"fmt"
	"net"
	"net/http"

	"github.com/ilyakaznacheev/cleanenv"
	"github.com/yogenyslav/ldt-2026/dicom-manager/internal/generated/orthanc"
)

// Config конфигурация подключения к Orthanc.
type Config struct {
	User     string `env:"ORTHANC_NAME"`
	Password string `env:"ORTHANC_PASSWORD"`
	Host     string `env:"ORTHANC_HOST"`
	Port     string `env:"ORTHANC_PORT"`
	Token    string `env:"ORTHANC_TOKEN"`
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
		addr, orthanc.WithRequestEditorFn(authorizationHeader(cfg.User, cfg.Password, cfg.Token)),
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

func authorizationHeader(user, password, token string) orthanc.RequestEditorFn {
	toEncode := fmt.Sprintf("%s:%s", user, password)
	encoded := base64.StdEncoding.EncodeToString([]byte(toEncode))

	if token != "" {
		encoded = token
	}

	return func(ctx context.Context, req *http.Request) error {
		req.Header.Set("Authorization", "Basic "+encoded)
		return nil
	}
}
