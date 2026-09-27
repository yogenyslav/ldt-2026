package create

import (
	"bytes"
	"context"
	"errors"
	"strings"
	"testing"

	"github.com/google/uuid"
	dto "github.com/prometheus/client_model/go"
	"github.com/rs/zerolog"
	storage "github.com/yogenyslav/ldt-2026/dicom-worker/internal/storage/outbox"
	"github.com/yogenyslav/ldt-2026/dicom-worker/pkg/events"
	"github.com/yogenyslav/ldt-2026/dicom-worker/pkg/observability/metrics"
)

type outboxRepoStub struct {
	events []storage.Event
}

func (r *outboxRepoStub) SaveEvent(_ context.Context, event storage.Event) error {
	r.events = append(r.events, event)
	return nil
}

func TestAnalysisRequest(t *testing.T) {
	for _, tc := range []struct {
		name   string
		status string
		valid  bool
	}{
		{name: "pending request", status: events.StatusPending, valid: true},
		{name: "incorrect status", status: events.StatusRunning},
	} {
		t.Run(tc.name, func(t *testing.T) {
			metricClient, err := metrics.New("test")
			if err != nil {
				t.Fatal(err)
			}
			var logs bytes.Buffer
			logger := zerolog.New(&logs)
			repo := &outboxRepoStub{}
			uc := New(&logger, metricClient, repo)
			event := events.New(uuid.NewString(), "orthanc-instance-id", tc.status)
			err = uc.CreateEvent(context.Background(), events.AnalysisRequested, event)
			if !tc.valid {
				if !errors.Is(err, events.ErrInvalidEvent) || len(repo.events) != 0 {
					t.Fatalf("invalid request reached outbox: %v, %v", repo.events, err)
				}
				for _, field := range []string{event.EventID, event.JobID, events.AnalysisRequested} {
					if !strings.Contains(logs.String(), field) {
						t.Fatalf("missing log context: %s", field)
					}
				}
				for name, want := range map[string]float64{"total": 1, "error": 1, "invalid": 1, "ok": 0} {
					var value dto.Metric
					if err := metricClient.Counter("usecases.outbox.create." + name).Write(&value); err != nil {
						t.Fatal(err)
					}
					if value.GetCounter().GetValue() != want {
						t.Fatalf("unexpected %s counter: %v", name, value.GetCounter().GetValue())
					}
				}
				return
			}
			if err != nil || len(repo.events) != 1 {
				t.Fatalf("request not saved: %v", err)
			}
			saved := repo.events[0]
			decoded, err := events.Decode(saved.Subject, saved.Payload)
			if err != nil || decoded.EventID != saved.ID || decoded.JobID != saved.JobID || decoded.DicomID != event.DicomID {
				t.Fatalf("request contract mismatch: %v, %v", decoded, err)
			}
		})
	}
}
