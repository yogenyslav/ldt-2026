package tracing

import (
	"context"
	"errors"
	"fmt"
	"net"
	"strconv"

	"github.com/ilyakaznacheev/cleanenv"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracehttp"
	"go.opentelemetry.io/otel/propagation"
	"go.opentelemetry.io/otel/sdk/resource"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	semconv "go.opentelemetry.io/otel/semconv/v1.43.0"
	"go.opentelemetry.io/otel/trace"
)

var (
	// ErrNewExporter ошибка создания OTLP экспортера.
	ErrNewExporter = errors.New("failed to create new otlp exporter")
	// ErrNewProvider ошибка создания нового провайдера трассировки.
	ErrNewProvider = errors.New("new trace provider can't be created")
)

// config конфиг для настройки трассировки.
type config struct {
	Host string `env:"TRACING_HOST"`
	Port int    `env:"TRACING_GRPC_PORT"`
}

// URL возвращает URL для подключения к OTLP экспортеру.
func (c *config) URL() string {
	return net.JoinHostPort(c.Host, strconv.Itoa(c.Port))
}

// Tracing клиент трассировок.
type Tracing struct {
	exporter sdktrace.SpanExporter
	provider *sdktrace.TracerProvider
	tracer   trace.Tracer
}

// New инициализирует трассировку, создавая экспортера и провайдера трассировки.
func New(appName string) (*Tracing, error) {
	var cfg config
	if err := cleanenv.ReadEnv(&cfg); err != nil {
		return nil, fmt.Errorf("parse tracing config from env: %w", err)
	}

	exporter, err := newExporter(context.Background(), cfg.URL())
	if err != nil {
		return nil, fmt.Errorf("create tracing exporter: %w", err)
	}

	provider, err := newTraceProvider(exporter, appName)
	if err != nil {
		return nil, fmt.Errorf("create tracing provider: %w", err)
	}

	otel.SetTextMapPropagator(
		propagation.NewCompositeTextMapPropagator(propagation.TraceContext{}, propagation.Baggage{}),
	)

	return &Tracing{
		exporter: exporter,
		provider: provider,
		tracer:   provider.Tracer(appName),
	}, nil
}

// Tracer возвращает объект трассировщика для создания спанов.
func (t *Tracing) Tracer() trace.Tracer {
	return t.tracer
}

// Provider возвращает провайдер трассировки.
func (t *Tracing) Provider() *sdktrace.TracerProvider {
	return t.provider
}

// Shutdown корректно завершает работу экспортера и провайдера трассировки.
func (t *Tracing) Shutdown(ctx context.Context) error {
	if err := t.provider.Shutdown(ctx); err != nil {
		return fmt.Errorf("shutdown tracing provider: %w", err)
	}
	if err := t.exporter.Shutdown(ctx); err != nil {
		return fmt.Errorf("shutdown tracing exporter: %w", err)
	}
	return nil
}

func newExporter(ctx context.Context, endpoint string) (sdktrace.SpanExporter, error) {
	exporter, err := otlptracehttp.New(ctx, otlptracehttp.WithInsecure(), otlptracehttp.WithEndpoint(endpoint))
	if err != nil {
		return nil, errors.Join(ErrNewExporter, err)
	}
	return exporter, nil
}

func newTraceProvider(exp sdktrace.SpanExporter, name string) (*sdktrace.TracerProvider, error) {
	r, err := resource.Merge(
		resource.Default(),
		resource.NewWithAttributes(
			semconv.SchemaURL,
			semconv.ServiceName(name),
		),
	)
	if err != nil {
		return nil, errors.Join(ErrNewProvider, err)
	}

	return sdktrace.NewTracerProvider(
		sdktrace.WithBatcher(exp),
		sdktrace.WithResource(r),
	), nil
}
