// Пакет messaging обеспечивает доставку событий с подтверждением после сохранения в БД.
// Содержимое пакета должно совпадать в независимых модулях manager и worker.
package messaging

import (
	"errors"
	"fmt"
	"time"

	"github.com/nats-io/nats.go"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/rs/zerolog"
)

const (
	// StreamName имя потока событий обработки DICOM-файлов.
	StreamName = "DICOM_EVENTS"
)

// ErrPermanentMessage ошибка сообщения, которое нельзя обработать при повторной доставке.
var ErrPermanentMessage = errors.New("permanent message failure")

type metricsClient interface {
	Counter(label string) prometheus.Counter
}

// Client клиент NATS для публикации и получения событий JetStream.
type Client struct {
	log     *zerolog.Logger
	metrics metricsClient
	conn    *nats.Conn
	js      nats.JetStreamContext
}

// New создает подключение к NATS и настраивает поток событий.
func New(log *zerolog.Logger, metrics metricsClient, cfg Config) (*Client, error) {
	if cfg.Replicas < 1 || cfg.Replicas > 5 {
		return nil, errors.New("invalid NATS_REPLICAS")
	}

	opts := []nats.Option{
		nats.Name(cfg.User),
		nats.Timeout(5 * time.Second),
		nats.MaxReconnects(-1),
		nats.ReconnectWait(time.Second),
	}
	if cfg.Password != "" {
		opts = append(opts, nats.UserInfo(cfg.User, cfg.Password))
	}

	conn, err := nats.Connect(cfg.URL, opts...)
	if err != nil {
		return nil, fmt.Errorf("connect to NATS: %w", err)
	}

	js, err := conn.JetStream(nats.MaxWait(5 * time.Second))
	if err != nil {
		conn.Close()
		return nil, fmt.Errorf("init JetStream: %w", err)
	}

	_, err = js.AddStream(
		&nats.StreamConfig{
			Name:       StreamName,
			Subjects:   []string{"dicom.>"},
			Storage:    nats.FileStorage,
			Retention:  nats.LimitsPolicy,
			Discard:    nats.DiscardNew,
			MaxAge:     30 * 24 * time.Hour,
			MaxBytes:   1 << 30,
			Replicas:   cfg.Replicas,
			Duplicates: 10 * time.Minute,
		},
	)
	if err != nil {
		conn.Close()
		return nil, fmt.Errorf("ensure stream: %w", err)
	}

	return &Client{
		log:     log,
		metrics: metrics,
		conn:    conn,
		js:      js,
	}, nil
}

// Close закрывает подключение к NATS.
func (c *Client) Close() {
	c.conn.Close()
}

// JetStream возвращает клиент хранилища событий.
func (c *Client) JetStream() nats.JetStreamContext {
	return c.js
}
