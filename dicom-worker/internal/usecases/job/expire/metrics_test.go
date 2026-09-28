package expire

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	dto "github.com/prometheus/client_model/go"
	"github.com/rs/zerolog"
	storage "github.com/yogenyslav/ldt-2026/dicom-worker/internal/storage/job"
	"github.com/yogenyslav/ldt-2026/dicom-worker/pkg/database"
	"github.com/yogenyslav/ldt-2026/dicom-worker/pkg/events"
	"github.com/yogenyslav/ldt-2026/dicom-worker/pkg/observability/metrics"
)

type transactionStub struct {
	commitErr error
	onBegin   func()
}

func (tx transactionStub) WithTx(ctx context.Context, _ database.TxLevel, fn func(context.Context) error) error {
	if tx.onBegin != nil {
		tx.onBegin()
	}
	if err := fn(ctx); err != nil {
		return err
	}
	return tx.commitErr
}

type jobRepoStub struct {
	status             string
	readErr, updateErr error
}

func (r jobRepoStub) GetExpiredForUpdate(context.Context, time.Duration, time.Duration) (storage.Job, error) {
	return storage.Job{Status: r.status}, r.readErr
}

func (r jobRepoStub) UpdateJobStatus(context.Context, string, string, string) error {
	return r.updateErr
}

type eventCreatorStub struct{ err error }

func (c eventCreatorStub) CreateEvent(context.Context, string, events.Event) error { return c.err }

func TestExpireMetrics(t *testing.T) {
	failure := errors.New("storage failure")
	for _, tc := range []struct {
		name, status, outcome                   string
		readErr, updateErr, eventErr, commitErr error
	}{
		{name: "pending", status: events.StatusPending, outcome: "ok"},
		{name: "running", status: events.StatusRunning, outcome: "ok"},
		{name: "empty", readErr: pgx.ErrNoRows, outcome: "empty"},
		{name: "read failed", readErr: failure, outcome: "error"},
		{name: "update failed", status: events.StatusPending, updateErr: failure, outcome: "error"},
		{name: "outbox failed", status: events.StatusRunning, eventErr: failure, outcome: "error"},
		{name: "commit failed", status: events.StatusPending, commitErr: failure, outcome: "error"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			m, err := metrics.New("test")
			if err != nil {
				t.Fatal(err)
			}
			logger := zerolog.Nop()
			uc := New(&logger, m, transactionStub{commitErr: tc.commitErr}, jobRepoStub{status: tc.status, readErr: tc.readErr, updateErr: tc.updateErr}, eventCreatorStub{err: tc.eventErr})
			// Sentinel verifies duration is updated even on empty/error paths.
			m.Gauge("usecases.job.expire.duration_seconds").Set(-1)
			_, err = uc.ExpireNext(context.Background())
			if (err != nil) != (tc.outcome == "error") {
				t.Fatalf("unexpected error: %v", err)
			}
			for _, name := range []string{"total", "ok", "empty", "error", "pending", "running"} {
				want := float64(0)
				if name == "total" || name == tc.outcome || (tc.outcome == "ok" && name == tc.status) {
					want = 1
				}
				var metric dto.Metric
				if err := m.Counter("usecases.job.expire." + name).Write(&metric); err != nil {
					t.Fatal(err)
				}
				if got := metric.GetCounter().GetValue(); got != want {
					t.Fatalf("%s=%v want=%v", name, got, want)
				}
			}
			var duration dto.Metric
			if err := m.Gauge("usecases.job.expire.duration_seconds").Write(&duration); err != nil {
				t.Fatal(err)
			}
			if duration.GetGauge().GetValue() < 0 {
				t.Fatal("duration was not recorded")
			}
		})
	}
}

func TestRunActiveMetric(t *testing.T) {
	m, err := metrics.New("test")
	if err != nil {
		t.Fatal(err)
	}
	logger := zerolog.Nop()
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	checked := false
	tx := transactionStub{onBegin: func() {
		var active dto.Metric
		if err := m.Gauge("expiration_checker.active").Write(&active); err != nil {
			t.Fatal(err)
		}
		if active.GetGauge().GetValue() != 1 {
			t.Fatal("checker is not marked active")
		}
		checked = true
		cancel()
	}}
	uc := New(&logger, m, tx, jobRepoStub{readErr: pgx.ErrNoRows}, eventCreatorStub{})
	uc.Run(ctx)
	if !checked {
		t.Fatal("checker did not run")
	}
	var active dto.Metric
	if err := m.Gauge("expiration_checker.active").Write(&active); err != nil {
		t.Fatal(err)
	}
	if active.GetGauge().GetValue() != 0 {
		t.Fatal("checker is still marked active after shutdown")
	}
}
