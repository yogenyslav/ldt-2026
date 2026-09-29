package upload

import (
	"context"
	"errors"
	"testing"
	"time"
	"uuid"

	"github.com/rs/zerolog"
	storage "github.com/yogenyslav/ldt-2026/dicom-manager/internal/storage/dicom"
	"github.com/yogenyslav/ldt-2026/dicom-manager/pkg/database"
	"github.com/yogenyslav/ldt-2026/dicom-manager/pkg/observability/metrics"
)

type orthancRepo struct {
	repoStub
	file  storage.Dicom
	saved []storage.Dicom
}

func (r *orthancRepo) SaveDicomFiles(_ context.Context, files []storage.Dicom) error {
	r.saved = files
	return r.err
}
func (r *orthancRepo) GetByID(context.Context, string) (storage.Dicom, error) { return r.file, r.err }
func (r *orthancRepo) GetByIDForUpdate(context.Context, string) (storage.Dicom, error) {
	return r.file, r.err
}

func TestRegisterOrthancOnlyPersists(t *testing.T) {
	failure := errors.New("database failed")
	for _, tc := range []struct {
		name               string
		saveErr, commitErr error
		foreign            bool
	}{
		{name: "success"}, {name: "save failure", saveErr: failure},
		{name: "commit failure", commitErr: failure}, {name: "foreign file", foreign: true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			file := storage.Dicom{UploadSource: storage.UploadSourceClinic, ID: "id", CreatorID: 42, OrganizationID: 218, SeriesID: "series", StudyID: "study"}
			repo := &orthancRepo{repoStub: repoStub{err: tc.saveErr}, file: file}
			if tc.foreign {
				repo.file.CreatorID++
			}
			// nil Orthanc/worker/jobCreator: registration must never use these dependencies.
			uc := &Usecase{uow: transactionStub{commitErr: tc.commitErr}, dicomRepo: repo}
			err := uc.RegisterOrthanc(context.Background(), file)
			if tc.foreign {
				if !errors.Is(err, ErrDicomForbidden) {
					t.Fatalf("error = %v", err)
				}
			} else if tc.saveErr != nil || tc.commitErr != nil {
				if !errors.Is(err, failure) {
					t.Fatalf("error = %v", err)
				}
			} else if err != nil {
				t.Fatal(err)
			}
			if len(repo.saved) != 1 || repo.saved[0] != file {
				t.Fatalf("saved = %+v", repo.saved)
			}
		})
	}
}

type blockingWorker struct{ started, release chan struct{} }

func (w blockingWorker) ProcessDicomFiles(ctx context.Context, ids []string, _ map[string]float64) (map[string]uuid.UUID, error) {
	close(w.started)
	select {
	case <-w.release:
		return map[string]uuid.UUID{ids[0]: uuid.New()}, nil
	case <-ctx.Done():
		return nil, ctx.Err()
	}
}

type notifyingTx struct{ finished chan error }

func (tx notifyingTx) WithTx(ctx context.Context, _ database.TxLevel, fn func(context.Context) error) error {
	err := fn(ctx)
	tx.finished <- err
	return err
}

func TestStartOrthancDoesNotWaitForWorker(t *testing.T) {
	logger := zerolog.Nop()
	m, err := metrics.New("orthanc_async_test")
	if err != nil {
		t.Fatal(err)
	}
	worker := blockingWorker{started: make(chan struct{}), release: make(chan struct{})}
	finished := make(chan error, 1)
	repo := &orthancRepo{file: storage.Dicom{ID: "id", CreatorID: 42, OrganizationID: 218}}
	uc := &Usecase{log: &logger, metrics: m, uow: notifyingTx{finished}, dicomRepo: repo, worker: worker, jobCreator: jobsStub{}}
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	returned := make(chan error, 1)
	go func() { returned <- uc.StartOrthanc(ctx, "id", 42, 218) }()
	defer close(worker.release)
	select {
	case err := <-returned:
		if err != nil {
			t.Fatal(err)
		}
	case <-time.After(time.Second):
		t.Fatal("start waited for worker")
	}
	cancel()
	select {
	case <-worker.started:
	case <-time.After(time.Second):
		t.Fatal("worker did not start")
	}
	select {
	case err := <-finished:
		t.Fatalf("request cancellation stopped processing: %v", err)
	default:
	}
	// Release explicitly and wait for the transaction before returning.
	worker.release <- struct{}{}
	select {
	case err := <-finished:
		if err != nil {
			t.Fatal(err)
		}
	case <-time.After(time.Second):
		t.Fatal("processing did not finish")
	}
}

func TestStartOrthancRejectsForeignFile(t *testing.T) {
	repo := &orthancRepo{file: storage.Dicom{CreatorID: 42, OrganizationID: 218}}
	uc := &Usecase{dicomRepo: repo}
	for _, ids := range [][2]int64{{43, 218}, {42, 219}} {
		if err := uc.StartOrthanc(context.Background(), "id", ids[0], ids[1]); !errors.Is(err, ErrDicomForbidden) {
			t.Fatalf("error = %v", err)
		}
	}
}
