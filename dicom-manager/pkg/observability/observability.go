package observability

import (
	"context"
	"errors"
	"os"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/rs/zerolog"
	"github.com/yogenyslav/errs"
	"github.com/yogenyslav/ldt-2026/dicom-manager/pkg/observability/metrics"
	"github.com/yogenyslav/ldt-2026/dicom-manager/pkg/observability/tracing"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	"go.opentelemetry.io/otel/trace"
)

var (
	// ErrAppNameNotSet ошибка, если переменная окружения APP_NAME не установлена.
	ErrAppNameNotSet = errors.New("APP_NAME environment variable is not set")
)

// MetricsClient интерфейс для работы с метриками.
type MetricsClient interface {
	Counter(label string) prometheus.Counter
	Gauge(label string) prometheus.Gauge
}

// TracingClient интерфейс для работы с трассировкой.
type TracingClient interface {
	Tracer() trace.Tracer
	Provider() *sdktrace.TracerProvider
	Shutdown(ctx context.Context) error
}

// Observability клиент для работы с метриками и трассировкой.
type Observability struct {
	metrics MetricsClient
	tracing TracingClient
	logger  zerolog.Logger
}

// New создает новый клиент для работы с метриками и трассировкой.
func New() (*Observability, error) {
	appName, ok := os.LookupEnv("APP_NAME")
	if !ok {
		return nil, errs.Wrap(ErrAppNameNotSet, "app name is required for observability")
	}

	m, err := metrics.New(appName)
	if err != nil {
		return nil, err
	}

	t, err := tracing.New(appName)
	if err != nil {
		return nil, err
	}

	return &Observability{
		metrics: m,
		tracing: t,
		logger:  zerolog.New(os.Stdout).With().Str("app", appName).Logger(),
	}, nil
}

// Metrics возвращает клиент для работы с метриками.
func (o *Observability) Metrics() MetricsClient {
	return o.metrics
}

// Tracing возвращает клиент для работы с трассировкой.
func (o *Observability) Tracing() TracingClient {
	return o.tracing
}

// Logger возвращает логгер.
func (o *Observability) Logger() *zerolog.Logger {
	return &o.logger
}

// Shutdown корректно завершает работу клиентов метрик и трассировки.
func (o *Observability) Shutdown(ctx context.Context) error {
	if err := o.tracing.Shutdown(ctx); err != nil {
		return errs.Wrap(err, "shutdown tracing client")
	}
	return nil
}
