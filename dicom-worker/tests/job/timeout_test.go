package job_test

import (
	"context"
	"encoding/json"
	"errors"
	"testing"

	"github.com/rs/zerolog"
	job_storage "github.com/yogenyslav/ldt-2026/dicom-worker/internal/storage/job"
	outbox_storage "github.com/yogenyslav/ldt-2026/dicom-worker/internal/storage/outbox"
	"github.com/yogenyslav/ldt-2026/dicom-worker/internal/usecases/job/apply_result"
	"github.com/yogenyslav/ldt-2026/dicom-worker/internal/usecases/job/expire"
	"github.com/yogenyslav/ldt-2026/dicom-worker/internal/usecases/job/process"
	"github.com/yogenyslav/ldt-2026/dicom-worker/internal/usecases/outbox/create"
	"github.com/yogenyslav/ldt-2026/dicom-worker/internal/usecases/outbox/publish_next"
	"github.com/yogenyslav/ldt-2026/dicom-worker/pkg/database"
	"github.com/yogenyslav/ldt-2026/dicom-worker/pkg/events"
	"github.com/yogenyslav/ldt-2026/dicom-worker/pkg/observability/metrics"
)

type failingEventCreator struct{}

func (failingEventCreator) CreateEvent(context.Context, string, events.Event) error {
	return errors.New("outbox unavailable")
}

func TestIntegrationJobTimeouts(t *testing.T) {
	db := integrationDB(t)
	ctx := context.Background()
	logger := zerolog.Nop()
	m, err := metrics.New("timeout_test")
	if err != nil {
		t.Fatal(err)
	}
	repo := job_storage.New(db)
	uow := database.NewUnitOfWork(db)
	outbox := outbox_storage.New(db)
	creator := create.New(&logger, m, outbox)
	processor := process.New(&logger, m, uow, repo, creator)
	expiry := expire.New(&logger, m, uow, repo, creator)
	apply := apply_result.New(&logger, m, uow, repo, creator)

	for _, tc := range []struct {
		name, status, age, wantError string
	}{
		{"pending expired", "pending", "301 seconds", "job timeout: pending exceeded 5m0s"},
		{"pending fresh", "pending", "240 seconds", ""},
		{"running expired", "running", "181 seconds", "job timeout: running exceeded 3m0s"},
		{"running fresh", "running", "120 seconds", ""},
		{"completed", "completed", "1 hour", ""},
		{"failed", "failed", "1 hour", ""},
	} {
		t.Run(tc.name, func(t *testing.T) {
			ids, err := processor.ProcessDicomFiles(ctx, []string{tc.name}, nil)
			if err != nil {
				t.Fatal(err)
			}
			id := ids[tc.name]
			// Старый created_at проверяет, что running отсчитывается от перехода в статус.
			_, err = db.Exec(ctx, `update analyzer_jobs set status=$2, created_at=now()-interval '1 day', updated_at=now()-$3::interval where id=$1`, id, tc.status, tc.age)
			if err != nil {
				t.Fatal(err)
			}
			if tc.wantError != "" {
				// Другой обработчик удерживает блокировку: проверка должна пропустить задачу.
				if err := uow.WithTx(ctx, database.TxLevelReadCommitted, func(txCtx context.Context) error {
					if _, err := repo.GetByIDForUpdate(txCtx, id); err != nil {
						return err
					}
					found, err := expiry.ExpireNext(ctx)
					if found || err != nil {
						t.Fatalf("locked job expired: %v %v", found, err)
					}
					return nil
				}); err != nil {
					t.Fatal(err)
				}
				broken := expire.New(&logger, m, uow, repo, failingEventCreator{})
				if _, err := broken.ExpireNext(ctx); err == nil {
					t.Fatal("expected outbox failure")
				}
				jobs, err := repo.GetByIDs(ctx, []string{id})
				if err != nil || len(jobs) != 1 || jobs[0].Status != tc.status {
					t.Fatalf("timeout was not rolled back: %v %v", jobs, err)
				}
			}
			found, err := expiry.ExpireNext(ctx)
			if err != nil || found != (tc.wantError != "") {
				t.Fatalf("expire: found=%v err=%v", found, err)
			}
			var stored struct {
				Status string `db:"status"`
				Error  string `db:"error"`
			}
			if err := db.QueryRow(ctx, &stored, `select status, error from analyzer_jobs where id=$1`, id); err != nil {
				t.Fatal(err)
			}
			wantStatus := tc.status
			if tc.wantError != "" {
				wantStatus = events.StatusFailed
			}
			if stored.Status != wantStatus || stored.Error != tc.wantError {
				t.Fatalf("stored=%+v want status=%s error=%s", stored, wantStatus, tc.wantError)
			}
			if tc.wantError != "" {
				var payload []byte
				if err := db.QueryRow(ctx, &payload, `select payload from outbox_events where job_id=$1 and event_type=$2`, id, events.DocumentFailed); err != nil {
					t.Fatal(err)
				}
				event, err := events.Decode(events.DocumentFailed, payload)
				if err != nil || event.Error != tc.wantError || event.JobID != id || event.DicomID != tc.name {
					t.Fatalf("notification=%+v err=%v", event, err)
				}
				late := events.New(id, tc.name, events.StatusCompleted)
				late.Result = &events.Result{Metadata: json.RawMessage(`{}`)}
				if err := apply.ApplyResult(ctx, late); err != nil {
					t.Fatal(err)
				}
				jobs, err := repo.GetByIDs(ctx, []string{id})
				if err != nil || jobs[0].Status != events.StatusFailed {
					t.Fatalf("late result changed status: %v %v", jobs, err)
				}
				// Просроченный запрос поглощается без обращения к недоступному брокеру.
				if tc.status == events.StatusPending {
					publisher := publish_next.New(&logger, m, uow, repo, outbox, creator, brokenPublisher{})
					if found, err := publisher.PublishNext(ctx); !found || err != nil {
						t.Fatalf("expired request published: %v %v", found, err)
					}
				}
			}
			if found, err := expiry.ExpireNext(ctx); found || err != nil {
				t.Fatalf("repeated expiry: %v %v", found, err)
			}
			var notifications int
			if err := db.QueryRow(ctx, &notifications, `select count(*) from outbox_events where job_id=$1 and event_type=$2`, id, events.DocumentFailed); err != nil {
				t.Fatal(err)
			}
			want := 0
			if tc.wantError != "" {
				want = 1
			}
			if notifications != want {
				t.Fatalf("notifications=%d want=%d", notifications, want)
			}
		})
	}
}
