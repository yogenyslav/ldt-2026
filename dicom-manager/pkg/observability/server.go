package observability

import (
	"errors"
	"fmt"
	"net"
	"net/http"
	"os"
	"time"
)

// StartMetricsServer запускает HTTP-сервер метрик на адресе METRICS_ADDR.
// По умолчанию метрики доступны на порту 9100 по пути /metrics.
func (o *Observability) StartMetricsServer() error {
	address := os.Getenv("METRICS_ADDR")
	if address == "" {
		address = ":9100"
	}

	listener, err := net.Listen("tcp", address)
	if err != nil {
		return fmt.Errorf("listen for metrics: %w", err)
	}

	mux := http.NewServeMux()
	mux.Handle("/metrics", o.metrics.Handler())
	o.metricsServer = &http.Server{
		Addr:              listener.Addr().String(),
		Handler:           mux,
		ReadHeaderTimeout: 5 * time.Second,
	}

	go func() {
		if err := o.metricsServer.Serve(listener); err != nil && !errors.Is(err, http.ErrServerClosed) {
			o.logger.Error().Err(err).Msg("metrics server stopped unexpectedly")
		}
	}()

	o.logger.Info().Str("address", listener.Addr().String()).Msg("metrics server started")
	return nil
}
