package observability

import (
	"context"
	"io"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/rs/zerolog"
	"github.com/yogenyslav/ldt-2026/dicom-worker/pkg/observability/metrics"
)

func TestMetricsEndpoint(t *testing.T) {
	t.Setenv("METRICS_ADDR", "127.0.0.1:0")
	metricClient, err := metrics.New("dicom-worker")
	if err != nil {
		t.Fatal(err)
	}
	obs := &Observability{metrics: metricClient, logger: zerolog.Nop()}
	if err := obs.StartMetricsServer(); err != nil {
		t.Fatal(err)
	}
	defer obs.metricsServer.Shutdown(context.Background())
	metricClient.Counter("usecases.job.process.ok").Inc()
	client := &http.Client{Timeout: time.Second}
	response, err := client.Get("http://" + obs.metricsServer.Addr + "/metrics")
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	body, err := io.ReadAll(response.Body)
	if err != nil {
		t.Fatal(err)
	}
	if response.StatusCode != http.StatusOK || !strings.Contains(string(body), "usecases") || !strings.Contains(string(body), "process") {
		t.Fatalf("metrics were not exported: status=%d body=%s", response.StatusCode, body)
	}
}
