package apply_event

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/rs/zerolog"
	storage "github.com/yogenyslav/ldt-2026/dicom-manager/internal/storage/job"
	"github.com/yogenyslav/ldt-2026/dicom-manager/pkg/database"
	"github.com/yogenyslav/ldt-2026/dicom-manager/pkg/events"
	metrics_pkg "github.com/yogenyslav/ldt-2026/dicom-manager/pkg/observability/metrics"
)

func TestIntegrationApplyEvents(t *testing.T) {
	logger := zerolog.Nop()
	metricClient, metricsErr := metrics_pkg.New("test")
	if metricsErr != nil {
		t.Fatal(metricsErr)
	}

	db := integrationDB(t)
	repo := storage.New(db)
	uc := New(&logger, metricClient, database.NewUnitOfWork(db), repo)

	ctx := context.Background()
	_, err := db.Exec(ctx, `insert into organization(id,name) values(1,'test'); insert into "user"(id,organization_id,full_name,email,password_hash) values(1,1,'test','test@example.test','test'); insert into dicom_file(id,file_name,study_id,series_id,dicom_study_uid,dicom_series_uid,dicom_image_uid,creator_id,organization_id) values('instance','test.dcm','study','series','study','series','image',1,1)`)
	if err != nil {
		t.Fatal(err)
	}

	id := uuid.NewString()
	running := events.New(id, "instance", "running")
	if err = uc.ApplyEvent(ctx, running); !errors.Is(err, pgx.ErrNoRows) {
		t.Fatalf("early event must be retried: %v", err)
	}
	if err = repo.SaveJobs(ctx, map[string]string{id: "instance"}); err != nil {
		t.Fatal(err)
	}
	if err = uc.ApplyEvent(ctx, running); err != nil {
		t.Fatal(err)
	}

	confidence := 0.9
	complete := events.New(id, "instance", "completed")
	complete.Result = &events.Result{AnatomicalRegion: "spine", Confidence: &confidence, Violations: []string{"positioning"}, Metadata: json.RawMessage(`{"model":"test"}`)}
	if err = uc.ApplyEvent(ctx, complete); err != nil {
		t.Fatal(err)
	}
	if err = uc.ApplyEvent(ctx, complete); err != nil {
		t.Fatal(err)
	}
	if err = uc.ApplyEvent(ctx, running); err != nil {
		t.Fatal(err)
	}

	failure := events.New(id, "instance", "failed")
	failure.Error = "late failure"
	if err = uc.ApplyEvent(ctx, failure); err != nil {
		t.Fatal(err)
	}

	result, err := repo.GetByID(ctx, id)
	if err != nil {
		t.Fatal(err)
	}
	if result.Status != "completed" || result.Confidence == nil || *result.Confidence != confidence || len(result.Violations) != 1 {
		t.Fatalf("incorrect result: %+v", result)
	}

	bad := complete
	bad.DicomID = "another"
	if err = uc.ApplyEvent(ctx, bad); !errors.Is(err, events.ErrInvalidEvent) {
		t.Fatalf("mismatch accepted: %v", err)
	}

	failure.JobID = uuid.NewString()
	failure.Error = "model failed"
	if err = repo.SaveJobs(ctx, map[string]string{failure.JobID: "instance"}); err != nil {
		t.Fatal(err)
	}
	if err = uc.ApplyEvent(ctx, failure); err != nil {
		t.Fatal(err)
	}

	result, err = repo.GetByID(ctx, failure.JobID)
	if err != nil || result.Status != "failed" || !strings.Contains(string(result.Metadata), "model failed") {
		t.Fatalf("failure missing: %+v %v", result, err)
	}
}
