package upload

import (
	"context"
	"errors"
	"fmt"
	"sync/atomic"
	"testing"
	"time"
	"uuid"

	"github.com/rs/zerolog"
	dicomstorage "github.com/yogenyslav/ldt-2026/dicom-manager/internal/storage/dicom"
	jobstorage "github.com/yogenyslav/ldt-2026/dicom-manager/internal/storage/job"
	"github.com/yogenyslav/ldt-2026/dicom-manager/internal/usecases/dicom/upload/wrappers"
	"github.com/yogenyslav/ldt-2026/dicom-manager/internal/usecases/dicom/upload/wrappers/dto"
	"github.com/yogenyslav/ldt-2026/dicom-manager/internal/usecases/job/apply_event"
	"github.com/yogenyslav/ldt-2026/dicom-manager/internal/usecases/job/get_by_dicom_id"
	"github.com/yogenyslav/ldt-2026/dicom-manager/pkg/database"
	"github.com/yogenyslav/ldt-2026/dicom-manager/pkg/events"
	"github.com/yogenyslav/ldt-2026/dicom-manager/pkg/observability/metrics"
)

type retryWorker struct{ calls atomic.Int32 }

func (w *retryWorker) ProcessDicomFiles(_ context.Context, ids []string) (map[string]uuid.UUID, error) {
	w.calls.Add(1)
	result := make(map[string]uuid.UUID)
	for _, id := range ids {
		if _, ok := result[id]; ok {
			return nil, fmt.Errorf("duplicate instance: %s", id)
		}
		result[id] = uuid.New()
	}
	return result, nil
}

func TestIntegrationRetryUpload(t *testing.T) {
	db := integrationDB(t)
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	_, err := db.Exec(ctx, `insert into organization(id,name) values(901,'retry'),(902,'other');
 insert into "user"(id,organization_id,full_name,email,password_hash)
 values(901,901,'retry','retry@example.test','test'),(902,902,'other','other@example.test','test')`)
	if err != nil {
		t.Fatal(err)
	}
	logger := zerolog.Nop()
	m, err := metrics.New("retry_test")
	if err != nil {
		t.Fatal(err)
	}
	dr, jr := dicomstorage.New(db), jobstorage.New(db)
	uow := database.NewUnitOfWork(db)
	worker := &retryWorker{}
	newUC := func(ids ...string) (*Usecase, *orthancStub) {
		o := &orthancStub{}
		for _, id := range ids {
			o.props = append(o.props, dto.OrthancDicomProperties{ID: id, FileName: "original.dcm"})
		}
		return &Usecase{log: &logger, metrics: m, uow: uow, dicomRepo: dr,
			worker: worker, jobCreator: wrappers.NewJobCreator(jr), dicomer: o}, o
	}
	request := DicomUploadRequest{CreatorID: 901, OrganizationID: 901, SyncOrthanc: true,
		RawDicoms: []RawDicomData{{FileName: "retry.dcm"}}}
	seed := func(id, status string) string {
		t.Helper()
		if err := dr.SaveDicomFiles(ctx, []dicomstorage.Dicom{{ID: id, FileName: "original.dcm", CreatorID: 901, OrganizationID: 901}}); err != nil {
			t.Fatal(err)
		}
		jobID := uuid.New().String()
		if err := jr.SaveJobs(ctx, map[string]string{jobID: id}); err != nil {
			t.Fatal(err)
		}
		if _, err := db.Exec(ctx, "update dicom_job_result set job_status=$2 where job_id=$1", jobID, status); err != nil {
			t.Fatal(err)
		}
		return jobID
	}

	t.Run("failed creates new job and preserves history", func(t *testing.T) {
		oldID := seed("retry", "failed")
		uc, o := newUC("retry")
		jobs, err := uc.UploadDicomFiles(ctx, request)
		if err != nil || len(jobs) != 1 || jobs["retry"].String() == oldID {
			t.Fatalf("jobs=%v err=%v", jobs, err)
		}
		old, err := jr.GetByID(ctx, oldID)
		if err != nil || old.Status != "failed" {
			t.Fatalf("old=%v err=%v", old, err)
		}
		next, err := jr.GetByID(ctx, jobs["retry"].String())
		if err != nil || next.Status != "pending" {
			t.Fatalf("new=%v err=%v", next, err)
		}
		file, err := dr.GetByID(ctx, "retry")
		if err != nil || file.CreatorID != 901 || file.FileName != "original.dcm" || len(o.deleted) != 0 {
			t.Fatalf("file=%v err=%v", file, err)
		}
		apply := apply_event.New(&logger, m, uow, jr)
		late := events.New(oldID, "retry", events.StatusRunning)
		if err := apply.ApplyEvent(ctx, late); err != nil {
			t.Fatal(err)
		}
		next, err = jr.GetByID(ctx, jobs["retry"].String())
		if err != nil || next.Status != "pending" {
			t.Fatalf("late event changed new job: %v %v", next, err)
		}
		fail := events.New(next.ID, "retry", events.StatusFailed)
		fail.Error = "analyzer failed again"
		if err := apply.ApplyEvent(ctx, fail); err != nil {
			t.Fatal(err)
		}
		third, err := uc.UploadDicomFiles(ctx, request)
		if err != nil || third["retry"] == jobs["retry"] {
			t.Fatalf("second retry=%v err=%v", third, err)
		}
	})

	t.Run("list all jobs for one DICOM", func(t *testing.T) {
		uc := get_by_dicom_id.New(&logger, m, jr, dr)
		jobs, err := uc.GetByDicomID(ctx, get_by_dicom_id.GetJobsRequest{DicomID: "retry", RequesterID: 901})
		if err != nil || len(jobs) != 3 {
			t.Fatalf("jobs=%v err=%v", jobs, err)
		}
		for i, job := range jobs {
			if job.DicomFileID != "retry" {
				t.Fatalf("unrelated job: %v", job)
			}
			if i > 0 && job.CreatedAt.After(jobs[i-1].CreatedAt) {
				t.Fatal("incorrect ordering")
			}
		}
	})
	for _, status := range []string{"pending", "running", "completed"} {
		t.Run(status+" retry policy", func(t *testing.T) {
			seed(status, status)
			uc, o := newUC(status)
			calls := worker.calls.Load()
			_, err := uc.UploadDicomFiles(ctx, request)
			wantCalls := calls
			if status == "completed" {
				wantCalls++
				if err != nil {
					t.Fatal(err)
				}
			} else if !errors.Is(err, ErrActiveJob) {
				t.Fatalf("expected active job conflict: %v", err)
			}
			if wantCalls != worker.calls.Load() || len(o.deleted) != 0 {
				t.Fatalf("err=%v calls=%d", err, worker.calls.Load())
			}
		})
	}
	t.Run("foreign owner rejected", func(t *testing.T) {
		seed("foreign", "failed")
		uc, _ := newUC("foreign")
		other := request
		other.CreatorID, other.OrganizationID = 902, 902
		_, err := uc.UploadDicomFiles(ctx, other)
		if !errors.Is(err, ErrDicomForbidden) {
			t.Fatalf("err=%v", err)
		}
	})
	t.Run("batch with new and failed deduplicates instances", func(t *testing.T) {
		seed("batch-failed", "failed")
		uc, _ := newUC("batch-new", "batch-failed", "batch-new")
		jobs, err := uc.UploadDicomFiles(ctx, request)
		if err != nil || len(jobs) != 2 {
			t.Fatalf("jobs=%v err=%v", jobs, err)
		}
	})

	t.Run("mixed batch starts only eligible files", func(t *testing.T) {
		activeJob := seed("batch-active", "running")
		pendingJob := seed("batch-pending", "pending")
		seed("batch-completed", "completed")
		seed("batch-retry", "failed")
		uc, o := newUC("batch-new-active", "batch-active", "batch-pending", "batch-completed", "batch-retry", "batch-new-active")
		calls := worker.calls.Load()
		jobs, err := uc.UploadDicomFiles(ctx, request)
		if err != nil || worker.calls.Load() != calls+1 || len(jobs) != 3 {
			t.Fatalf("jobs=%v err=%v", jobs, err)
		}
		for _, id := range []string{"batch-new-active", "batch-completed", "batch-retry"} {
			if _, ok := jobs[id]; !ok {
				t.Fatalf("missing new job for %s", id)
			}
		}
		for id, oldID := range map[string]string{"batch-active": activeJob, "batch-pending": pendingJob} {
			saved, err := jr.GetJobsByDicomID(ctx, id)
			if err != nil || len(saved) != 1 || saved[0].ID != oldID {
				t.Fatalf("active jobs changed: %v %v", saved, err)
			}
		}
		var files int
		if err := db.QueryRow(ctx, &files, "select count(*) from dicom_file where id='batch-new-active'"); err != nil || files != 1 {
			t.Fatalf("files=%d err=%v", files, err)
		}
		if len(o.deleted) != 0 {
			t.Fatalf("unexpected Orthanc cleanup: %v", o.deleted)
		}
	})
	t.Run("fully active batch returns conflict without calling worker", func(t *testing.T) {
		uc, _ := newUC("batch-active", "batch-pending")
		calls := worker.calls.Load()
		_, err := uc.UploadDicomFiles(ctx, request)
		if !errors.Is(err, ErrActiveJob) || worker.calls.Load() != calls {
			t.Fatalf("err=%v", err)
		}
	})
	t.Run("concurrent uploads create one new job", func(t *testing.T) {
		seed("concurrent", "failed")
		calls := worker.calls.Load()
		start := make(chan struct{})
		results := make(chan error, 2)
		for range 2 {
			uc, _ := newUC("concurrent")
			go func() {
				<-start
				_, err := uc.UploadDicomFiles(ctx, request)
				results <- err
			}()
		}
		close(start)
		var conflicts int
		for range 2 {
			err := <-results
			if errors.Is(err, ErrActiveJob) {
				conflicts++
			} else if err != nil {
				t.Fatal(err)
			}
		}
		if conflicts != 1 {
			t.Fatalf("conflicts=%d", conflicts)
		}
		jobs, err := jr.GetJobsByDicomID(ctx, "concurrent")
		if err != nil || len(jobs) != 2 || worker.calls.Load()-calls != 1 {
			t.Fatalf("jobs=%v calls=%d err=%v", jobs, worker.calls.Load()-calls, err)
		}
		var files int
		if err := db.QueryRow(ctx, &files, "select count(*) from dicom_file where id='concurrent'"); err != nil || files != 1 {
			t.Fatalf("files=%d err=%v", files, err)
		}
	})
}
