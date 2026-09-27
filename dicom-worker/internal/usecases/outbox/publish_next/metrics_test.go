package publish_next

import (
	"context"
	"errors"
	"testing"

	"github.com/jackc/pgx/v5"
	dto "github.com/prometheus/client_model/go"
	"github.com/rs/zerolog"
	storage "github.com/yogenyslav/ldt-2026/dicom-worker/internal/storage/outbox"
	"github.com/yogenyslav/ldt-2026/dicom-worker/pkg/database"
	"github.com/yogenyslav/ldt-2026/dicom-worker/pkg/events"
	"github.com/yogenyslav/ldt-2026/dicom-worker/pkg/observability/metrics"
)

type transactionStub struct {
	commitErr error
}

func (tx transactionStub) WithTx(ctx context.Context, _ database.TxLevel, fn func(context.Context) error) error {
	if err := fn(ctx); err != nil {
		return err
	}
	return tx.commitErr
}

type outboxRepoStub struct {
	err error
}

func (r outboxRepoStub) GetNextForUpdate(context.Context) (storage.Event, error) {
	return storage.Event{ID: "event", JobID: "job", Subject: events.DocumentUpdated}, r.err
}

func (outboxRepoStub) SavePublishError(context.Context, string, string) error {
	return nil
}

func (outboxRepoStub) MarkPublished(context.Context, string) error {
	return nil
}

type publisherStub struct {
	err error
}

func (p publisherStub) Publish(context.Context, string, string, []byte) error {
	return p.err
}

func TestPublishOutcomeMetrics(t *testing.T) {
	for _, tc := range []struct {
		name       string
		repoErr    error
		publishErr error
		commitErr  error
		outcome    string
	}{
		{name: "published", outcome: "ok"},
		{name: "empty", repoErr: pgx.ErrNoRows, outcome: "empty"},
		{name: "broker failed", publishErr: errors.New("broker unavailable"), outcome: "publish_error"},
		{name: "commit failed after publish", commitErr: errors.New("commit failed"), outcome: "transaction_error"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			metricClient, err := metrics.New("test")
			if err != nil {
				t.Fatal(err)
			}
			logger := zerolog.Nop()
			uc := New(
				&logger, metricClient, transactionStub{commitErr: tc.commitErr}, nil,
				outboxRepoStub{err: tc.repoErr}, nil, publisherStub{err: tc.publishErr},
			)
			_, err = uc.PublishNext(context.Background())
			wantErr := errors.Join(tc.publishErr, tc.commitErr)
			if (err != nil) != (wantErr != nil) {
				t.Fatalf("unexpected error: %v", err)
			}
			for metric, want := range map[string]float64{"total": 1, tc.outcome: 1} {
				var value dto.Metric
				if err := metricClient.Counter("usecases.outbox.publish_next." + metric).Write(&value); err != nil {
					t.Fatal(err)
				}
				if value.GetCounter().GetValue() != want {
					t.Fatalf("%s: %v", metric, value.GetCounter().GetValue())
				}
			}
			if tc.outcome != "ok" {
				var value dto.Metric
				if err := metricClient.Counter("usecases.outbox.publish_next.ok").Write(&value); err != nil {
					t.Fatal(err)
				}
				if value.GetCounter().GetValue() != 0 {
					t.Fatal("publication counted before successful commit")
				}
			}
		})
	}
}
