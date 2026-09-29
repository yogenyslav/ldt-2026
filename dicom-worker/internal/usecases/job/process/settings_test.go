package process

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/rs/zerolog"
	"github.com/yogenyslav/ldt-2026/dicom-worker/pkg/database"
	"github.com/yogenyslav/ldt-2026/dicom-worker/pkg/events"
	"github.com/yogenyslav/ldt-2026/dicom-worker/pkg/observability/metrics"
)

type txStub struct{}

func (txStub) WithTx(ctx context.Context, _ database.TxLevel, fn func(context.Context) error) error {
	return fn(ctx)
}

type jobStub struct{}

func (jobStub) SaveJob(context.Context, string, string) error {
	return nil
}

type eventStub struct {
	payloads [][]byte
}

func (s *eventStub) CreateEvent(_ context.Context, subject string, event events.Event) error {
	if err := event.Validate(subject); err != nil {
		return err
	}

	payload, err := json.Marshal(event)
	s.payloads = append(s.payloads, payload)

	return err
}

func TestSettingsSnapshotInOutbox(t *testing.T) {
	log := zerolog.Nop()
	m, err := metrics.New("settings_test")
	if err != nil {
		t.Fatal(err)
	}

	outbox := &eventStub{}
	uc := New(&log, m, txStub{}, jobStub{}, outbox)
	settings := map[string]float64{"trochanter_center_mm": 3, "trochanter_tol_percent": 50, "trochanter_yellow_percent": 20}
	jobs, err := uc.ProcessDicomFiles(context.Background(), []string{"a", "b", "a"}, settings)
	if err != nil || len(jobs) != 2 || len(outbox.payloads) != 2 {
		t.Fatalf("batch: %v %v", jobs, err)
	}

	settings["trochanter_center_mm"] = 1
	for _, payload := range outbox.payloads {
		event, err := events.Decode(events.AnalysisRequested, payload)
		if err != nil || event.Settings["trochanter_center_mm"] != 3 {
			t.Fatalf("snapshot lost: %s %v", payload, err)
		}
	}

	if _, err := uc.ProcessDicomFiles(context.Background(), []string{"c"}, map[string]float64{"trochanter_tol_percent": 200}); err == nil {
		t.Fatal("invalid settings accepted")
	}

	if len(outbox.payloads) != 2 {
		t.Fatal("invalid settings produced work")
	}
}
