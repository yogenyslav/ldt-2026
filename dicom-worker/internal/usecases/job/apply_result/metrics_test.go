package apply_result

import (
	"bytes"
	"context"
	"errors"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	dto "github.com/prometheus/client_model/go"
	"github.com/rs/zerolog"
	storage "github.com/yogenyslav/ldt-2026/dicom-worker/internal/storage/job"
	"github.com/yogenyslav/ldt-2026/dicom-worker/pkg/database"
	"github.com/yogenyslav/ldt-2026/dicom-worker/pkg/events"
	"github.com/yogenyslav/ldt-2026/dicom-worker/pkg/observability/metrics"
)

type transactionStub struct{ commitErr error }

func (tx transactionStub) WithTx(ctx context.Context, _ database.TxLevel, fn func(context.Context) error) error {
	if err := fn(ctx); err != nil {
		return err
	}
	return tx.commitErr
}

type jobRepoStub struct {
	state storage.Job
	err   error
}

func (r *jobRepoStub) GetByIDForUpdate(context.Context, string) (storage.Job, error) {
	return r.state, r.err
}

func (r *jobRepoStub) SaveResult(context.Context, string, storage.DetectionProperties) error {
	return nil
}
func (r *jobRepoStub) UpdateJobStatus(context.Context, string, string, string) error { return nil }

type eventCreatorStub struct{}

func (eventCreatorStub) CreateEvent(context.Context, string, events.Event) error { return nil }

func TestApplyEventMetricsAndLogs(t *testing.T) {
	commitErr := errors.New("commit failed")
	for _, tc := range []struct {
		name      string
		status    string
		dicomID   string
		repoErr   error
		commitErr error
		outcome   string
		wantErr   bool
	}{
		{name: "applied", status: events.StatusRunning, dicomID: "instance", outcome: "ok"},
		{name: "terminal duplicate", status: events.StatusCompleted, dicomID: "instance", outcome: "ignored"},
		{name: "missing job", dicomID: "instance", repoErr: pgx.ErrNoRows, outcome: "not_found", wantErr: true},
		{name: "wrong instance", dicomID: "other", outcome: "invalid", wantErr: true},
		{name: "commit failed", status: events.StatusRunning, dicomID: "instance", commitErr: commitErr, outcome: "error", wantErr: true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			metricClient, err := metrics.New("test")
			if err != nil {
				t.Fatal(err)
			}
			var logs bytes.Buffer
			logger := zerolog.New(&logs)
			repo := &jobRepoStub{state: storage.Job{DicomID: tc.dicomID, Status: tc.status}, err: tc.repoErr}
			uc := New(&logger, metricClient, transactionStub{commitErr: tc.commitErr}, repo, eventCreatorStub{})
			event := events.New(uuid.NewString(), "instance", events.StatusFailed)
			event.Error = "model unavailable"
			err = uc.ApplyResult(context.Background(), event)
			if (err != nil) != tc.wantErr {
				t.Fatalf("unexpected error: %v", err)
			}
			if tc.commitErr != nil && !errors.Is(err, tc.commitErr) {
				t.Fatalf("commit error lost: %v", err)
			}
			for metric, want := range map[string]float64{"total": 1, tc.outcome: 1} {
				var value dto.Metric
				if err := metricClient.Counter("usecases.job.apply_result." + metric).Write(&value); err != nil {
					t.Fatal(err)
				}
				if value.GetCounter().GetValue() != want {
					t.Fatalf("%s: %v", metric, value.GetCounter().GetValue())
				}
			}
			if tc.outcome != "ok" {
				for _, metric := range []string{"ok", "failed"} {
					var value dto.Metric
					if err := metricClient.Counter("usecases.job.apply_result." + metric).Write(&value); err != nil {
						t.Fatal(err)
					}
					if value.GetCounter().GetValue() != 0 {
						t.Fatalf("%s counted without commit", metric)
					}
				}
			}
			if !strings.Contains(logs.String(), event.JobID) || !strings.Contains(logs.String(), event.EventID) {
				t.Fatalf("event context is missing from logs: %s", logs.String())
			}
		})
	}
}
