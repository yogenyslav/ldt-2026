package apply_result

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"testing"

	"github.com/google/uuid"
	dto "github.com/prometheus/client_model/go"
	"github.com/rs/zerolog"
	"github.com/yogenyslav/ldt-2026/dicom-worker/pkg/events"
	"github.com/yogenyslav/ldt-2026/dicom-worker/pkg/messaging"
	"github.com/yogenyslav/ldt-2026/dicom-worker/pkg/observability/metrics"
)

type usecaseStub struct {
	calls int
	err   error
}

func (uc *usecaseStub) ApplyResult(context.Context, events.Event) error {
	uc.calls++
	return uc.err
}

func TestMessageOutcomes(t *testing.T) {
	transientErr := errors.New("database unavailable")
	event := events.New(uuid.NewString(), "instance", events.StatusFailed)
	event.Error = "model unavailable"
	payload, err := json.Marshal(event)
	if err != nil {
		t.Fatal(err)
	}
	for _, tc := range []struct {
		name       string
		payload    []byte
		usecaseErr error
		outcome    string
		calls      int
		permanent  bool
	}{
		{name: "valid", payload: payload, outcome: "ok", calls: 1},
		{name: "malformed", payload: []byte(`{`), outcome: "invalid", permanent: true},
		{name: "database error", payload: payload, usecaseErr: transientErr, outcome: "error", calls: 1},
		{name: "wrong job", payload: payload, usecaseErr: events.ErrInvalidEvent, outcome: "invalid", calls: 1, permanent: true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			metricClient, err := metrics.New("test")
			if err != nil {
				t.Fatal(err)
			}
			var logs bytes.Buffer
			logger := zerolog.New(&logs)
			uc := &usecaseStub{err: tc.usecaseErr}
			handler := New(&logger, metricClient, uc, events.AnalysisFailed)
			err = handler.Handle(context.Background(), tc.payload)
			if errors.Is(err, messaging.ErrPermanentMessage) != tc.permanent {
				t.Fatalf("unexpected classification: %v", err)
			}
			if tc.usecaseErr == transientErr && !errors.Is(err, transientErr) {
				t.Fatalf("retry error lost: %v", err)
			}
			if uc.calls != tc.calls {
				t.Fatalf("unexpected usecase calls: %d", uc.calls)
			}
			for _, metric := range []string{"total", tc.outcome} {
				var value dto.Metric
				if err := metricClient.Counter("subscriber.job.apply_result." + metric).Write(&value); err != nil {
					t.Fatal(err)
				}
				if value.GetCounter().GetValue() != 1 {
					t.Fatalf("%s not counted", metric)
				}
			}
			if tc.outcome != "ok" && logs.Len() == 0 {
				t.Fatal("error was not logged")
			}
		})
	}
}
