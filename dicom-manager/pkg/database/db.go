// Package database операции с базой данных.
package database

import (
	"context"
	"database/sql"
	"errors"
)

// TxLevel уровень изоляции транзакции.
type TxLevel string

// Доступные уровни изоляции транзакций.
const (
	TxLevelReadCommitted TxLevel = "read committed"
	TxLevelSerializable  TxLevel = "serializable"
)

// CtxKey враппер для ключей контекста.
type CtxKey string

// TxKey ключ для хранения транзакции в контексте.
const TxKey CtxKey = "tx"

// ErrNoTx ошибка, если в контексте отсутствует транзакция.
var ErrNoTx = errors.New("no transaction in context")

// Config структура конфигурации для подключения к базе данных.
type Config struct {
	URI      string `yaml:"uri"      env:"DATABASE_URI"`
	User     string `yaml:"user"     env:"DB_USER"`
	Password string `yaml:"password" env:"DB_PASSWORD"`
	Name     string `yaml:"name"     env:"DB_NAME"`
	Host     string `yaml:"host"     env:"DB_HOST"`
	Port     string `yaml:"port"     env:"DB_PORT"`
	Driver   string `yaml:"driver"   env:"DB_DRIVER"`
	SSLMode  string `yaml:"sslmode"  env:"DB_SSLMODE"`
}

// DSN формирует строку подключения к базе данных на основе конфигурации.
func (c *Config) DSN() string {
	if c.URI != "" {
		return c.URI
	}
	return c.Driver + "://" + c.User + ":" + c.Password + "@" + c.Host + ":" + c.Port + "/" + c.Name + "?sslmode=" + c.SSLMode
}

// DB основной интерфейс для работы с БД.
//
//go:generate mockgen -destination=../../tests/mocks/db.go -package=mocks . DB
type DB interface {
	Exec(ctx context.Context, query string, args ...any) (int64, error)
	TxExec(ctx context.Context, query string, args ...any) (int64, error)
	QueryRow(ctx context.Context, dst any, query string, args ...any) error
	TxQueryRow(ctx context.Context, dst any, query string, args ...any) error
	QuerySlice(ctx context.Context, dst any, query string, args ...any) error
	TxQuerySlice(ctx context.Context, dst any, query string, args ...any) error
	Ping(ctx context.Context) error
	SQLDB() (*sql.DB, error)
	Close()

	beginTx(ctx context.Context, level TxLevel) (context.Context, error)
	commitTx(ctx context.Context) error
	rollbackTx(ctx context.Context) error
}
