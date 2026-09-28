package job_test

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/nats-io/nats.go"
	"github.com/rs/zerolog"
	job_storage "github.com/yogenyslav/ldt-2026/dicom-worker/internal/storage/job"
	outbox_storage "github.com/yogenyslav/ldt-2026/dicom-worker/internal/storage/outbox"
	"github.com/yogenyslav/ldt-2026/dicom-worker/internal/usecases/job/apply_result"
	"github.com/yogenyslav/ldt-2026/dicom-worker/internal/usecases/job/process"
	"github.com/yogenyslav/ldt-2026/dicom-worker/internal/usecases/outbox/create"
	"github.com/yogenyslav/ldt-2026/dicom-worker/internal/usecases/outbox/publish_next"
	"github.com/yogenyslav/ldt-2026/dicom-worker/pkg/database"
	"github.com/yogenyslav/ldt-2026/dicom-worker/pkg/events"
	"github.com/yogenyslav/ldt-2026/dicom-worker/pkg/messaging"
	metrics_pkg "github.com/yogenyslav/ldt-2026/dicom-worker/pkg/observability/metrics"
)

type brokenPublisher struct{}

func (brokenPublisher) Publish(context.Context, string, string, []byte) error {
	return errors.New("broker unavailable")
}

func TestIntegrationOutboxAndResults(t *testing.T) {
	logger := zerolog.Nop()
	metricClient, metricsErr := metrics_pkg.New("test")
	if metricsErr != nil {
		t.Fatal(metricsErr)
	}

	db := integrationDB(t)
	repo := job_storage.New(db)
	uow := database.NewUnitOfWork(db)
	outboxRepo := outbox_storage.New(db)
	createEvent := create.New(&logger, metricClient, outboxRepo)
	processJobs := process.New(&logger, metricClient, uow, repo, createEvent)
	applyResult := apply_result.New(&logger, metricClient, uow, repo, createEvent)
	ctx := context.Background()
	if os.Getenv("TEST_NATS_URL") == "" {
		t.Skip("TEST_NATS_URL is not set")
	}
	t.Setenv("NATS_URL", os.Getenv("TEST_NATS_URL"))
	t.Setenv("NATS_REPLICAS", "1")
	t.Setenv("DICOM_WORKER_PASSWORD", "")
	cfg, err := messaging.ReadConfig("dicom-worker", "DICOM_WORKER_PASSWORD")
	if err != nil {
		t.Fatal(err)
	}
	client, err := messaging.New(&logger, metricClient, cfg)
	if err != nil {
		t.Fatal(err)
	}
	defer client.Close()
	publishNext := publish_next.New(&logger, metricClient, uow, repo, outboxRepo, createEvent, client)
	failedPublish := publish_next.New(&logger, metricClient, uow, repo, outboxRepo, createEvent, brokenPublisher{})
	ids, err := processJobs.ProcessDicomFiles(ctx, []string{"orthanc-instance", "orthanc-instance"})
	if err != nil || len(ids) != 1 {
		t.Fatalf("create: %v %v", ids, err)
	}
	id := ids["orthanc-instance"]
	if found, err := failedPublish.PublishNext(ctx); !found || err == nil {
		t.Fatalf("expected publication failure: %v %v", found, err)
	}
	var pending int
	if err = db.QueryRow(ctx, &pending, `select count(*) from outbox_events where publishing_status='pending' and attempts=1`); err != nil || pending != 1 {
		t.Fatalf("retry not persisted: %d %v", pending, err)
	}
	if _, err = db.Exec(ctx, `update outbox_events set available_at=now()`); err != nil {
		t.Fatal(err)
	}
	if found, err := publishNext.PublishNext(ctx); !found || err != nil {
		t.Fatalf("publish: %v %v", found, err)
	}
	jobs, err := repo.GetByIDs(ctx, []string{id})
	if err != nil || len(jobs) != 1 || jobs[0].Status != "running" {
		t.Fatalf("jobs: %v %v", jobs, err)
	}
	sub, err := client.JetStream().PullSubscribe(events.AnalysisRequested, "test-request-"+id, nats.BindStream(messaging.StreamName))
	if err != nil {
		t.Fatal(err)
	}
	defer sub.Unsubscribe()
	messages, err := sub.Fetch(100, nats.MaxWait(time.Second))
	if err != nil {
		t.Fatal(err)
	}
	matched := false
	for _, msg := range messages {
		e, err := events.Decode(events.AnalysisRequested, msg.Data)
		if err != nil {
			t.Fatal(err)
		}
		if e.JobID == id {
			matched = true
		}
		_ = msg.Ack()
	}
	if !matched {
		t.Fatal("request was not persisted in JetStream")
	}
	confidence := 0.95
	result := events.New(id, "orthanc-instance", "completed")
	result.Result = &events.Result{AnatomicalRegion: "spine", Confidence: &confidence, Violations: []string{}, Metadata: json.RawMessage(`{"model":"test"}`)}
	if err = applyResult.ApplyResult(ctx, result); err != nil {
		t.Fatal(err)
	}
	if err = applyResult.ApplyResult(ctx, result); err != nil {
		t.Fatal(err)
	}
	failure := events.New(id, "orthanc-instance", "failed")
	failure.Error = "late failure"
	if err = applyResult.ApplyResult(ctx, failure); err != nil {
		t.Fatal(err)
	}
	jobs, err = repo.GetByIDs(ctx, []string{id})
	if err != nil || jobs[0].Status != "completed" {
		t.Fatalf("terminal state changed: %v %v", jobs, err)
	}
	var count int
	if err = db.QueryRow(ctx, &count, `select count(*) from analyzer_job_results`); err != nil || count != 1 {
		t.Fatalf("duplicate result: %d %v", count, err)
	}
	if err = db.QueryRow(ctx, &count, `select count(*) from outbox_events`); err != nil || count != 3 {
		t.Fatalf("duplicate notification: %d %v", count, err)
	}
	for i := 0; i < 2; i++ {
		if found, err := publishNext.PublishNext(ctx); !found || err != nil {
			t.Fatalf("notification: %v %v", found, err)
		}
	}
	if found, err := publishNext.PublishNext(ctx); found || err != nil {
		t.Fatalf("unexpected remaining event: %v %v", found, err)
	}
	// Неизвестную задачу обрабатываем повторно, несовпадающий снимок отклоняем.
	result.JobID = uuid.NewString()
	if err = applyResult.ApplyResult(ctx, result); !errors.Is(err, pgx.ErrNoRows) {
		t.Fatalf("unknown job: %v", err)
	}
	result.JobID = id
	result.DicomID = "other"
	if err = applyResult.ApplyResult(ctx, result); !errors.Is(err, events.ErrInvalidEvent) {
		t.Fatalf("wrong instance: %v", err)
	}
	failedIDs, err := processJobs.ProcessDicomFiles(ctx, []string{"failed-instance"})
	if err != nil {
		t.Fatal(err)
	}
	failure = events.New(failedIDs["failed-instance"], "failed-instance", "failed")
	failure.Error = "inference failed"
	if err = applyResult.ApplyResult(ctx, failure); err != nil {
		t.Fatal(err)
	}
	jobs, err = repo.GetByIDs(ctx, []string{failure.JobID})
	if err != nil || jobs[0].Status != "failed" {
		t.Fatalf("failure not stored: %v %v", jobs, err)
	}
}

// TestIntegrationRetryFailedJob проверяет новую попытку и событие для analyzer без запуска брокера.
func TestIntegrationRetryFailedJob(t *testing.T) {
	db := integrationDB(t)
	ctx := context.Background()
	logger := zerolog.Nop()
	metricClient, err := metrics_pkg.New("retry_test")
	if err != nil {
		t.Fatal(err)
	}
	repo := job_storage.New(db)
	createEvent := create.New(&logger, metricClient, outbox_storage.New(db))
	uc := process.New(&logger, metricClient, database.NewUnitOfWork(db), repo, createEvent)
	apply := apply_result.New(&logger, metricClient, database.NewUnitOfWork(db), repo, createEvent)
	first, err := uc.ProcessDicomFiles(ctx, []string{"retry-instance"})
	if err != nil {
		t.Fatal(err)
	}
	oldID := first["retry-instance"]
	failure := events.New(oldID, "retry-instance", events.StatusFailed)
	failure.Error = "analyzer failed"
	if err := apply.ApplyResult(ctx, failure); err != nil {
		t.Fatal(err)
	}
	second, err := uc.ProcessDicomFiles(ctx, []string{"retry-instance"})
	if err != nil {
		t.Fatal(err)
	}
	newID := second["retry-instance"]
	if newID == oldID || newID == "" {
		t.Fatalf("job IDs: old=%s new=%s", oldID, newID)
	}
	jobs, err := repo.GetByIDs(ctx, []string{oldID, newID})
	if err != nil || len(jobs) != 2 {
		t.Fatalf("jobs=%v err=%v", jobs, err)
	}
	for _, job := range jobs {
		want := "pending"
		if job.ID == oldID {
			want = "failed"
		}
		if job.Status != want {
			t.Fatalf("job=%+v want=%s", job, want)
		}
	}
	var count int
	if err := db.QueryRow(ctx, &count,
		"select count(*) from outbox_events where job_id=$1 and event_type=$2",
		newID, events.AnalysisRequested); err != nil || count != 1 {
		t.Fatalf("new analyzer events=%d err=%v", count, err)
	}
}
