package observability

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"os"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/rs/zerolog"
	"github.com/yogenyslav/ldt-2026/dicom-worker/pkg/observability/metrics"
	"github.com/yogenyslav/ldt-2026/dicom-worker/pkg/observability/tracing"
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
	metrics       *metrics.Metrics
	metricsServer *http.Server
	tracing       TracingClient
	logger        zerolog.Logger
}

// New создает новый клиент для работы с метриками и трассировкой.
func New() (*Observability, error) {
	appName, ok := os.LookupEnv("APP_NAME")
	if !ok {
		return nil, fmt.Errorf("app name is required for observability: %v", ErrAppNameNotSet)
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
		logger:  zerolog.New(os.Stdout).With().Timestamp().Str("app", appName).Logger(),
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
	var metricsErr error
	if o.metricsServer != nil {
		metricsErr = o.metricsServer.Shutdown(ctx)
	}
	tracingErr := o.tracing.Shutdown(ctx)
	return errors.Join(metricsErr, tracingErr)
}
