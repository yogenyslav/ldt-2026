package messaging

import (
	"fmt"
	"os"

	"github.com/ilyakaznacheev/cleanenv"
)

// Config конфигурация подключения к NATS и хранилища JetStream.
type Config struct {
	URL      string `env:"NATS_URL" env-default:"nats://127.0.0.1:4222"`
	Replicas int    `env:"NATS_REPLICAS" env-default:"1"`
	User     string
	Password string
}

// ReadConfig читает настройки NATS и пароль указанного пользователя из окружения.
func ReadConfig(user, passwordEnv string) (Config, error) {
	var cfg Config
	if err := cleanenv.ReadEnv(&cfg); err != nil {
		return Config{}, fmt.Errorf("read NATS config: %w", err)
	}
	
	cfg.User = user
	cfg.Password = os.Getenv(passwordEnv)
	return cfg, nil
}
