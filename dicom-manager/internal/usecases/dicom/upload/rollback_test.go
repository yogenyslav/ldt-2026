package upload

import (
	"context"
	"errors"
	"reflect"
	"testing"
	"uuid"

	"github.com/rs/zerolog"
	storage "github.com/yogenyslav/ldt-2026/dicom-manager/internal/storage/dicom"
	"github.com/yogenyslav/ldt-2026/dicom-manager/internal/usecases/dicom/upload/wrappers/dto"
	"github.com/yogenyslav/ldt-2026/dicom-manager/pkg/database"
	"github.com/yogenyslav/ldt-2026/dicom-manager/pkg/observability/metrics"
)

type transactionStub struct{ beginErr, commitErr error }

func (s transactionStub) WithTx(ctx context.Context, _ database.TxLevel, fn func(context.Context) error) error {
	if s.beginErr != nil {
		return s.beginErr
	}
	if err := fn(ctx); err != nil {
		return err
	}
	return s.commitErr
}

type repoStub struct{ err error }

func (s repoStub) SaveDicomFiles(context.Context, []storage.Dicom) error { return s.err }

type workerStub struct{ err error }

func (s workerStub) ProcessDicomFiles(context.Context, []string) (map[string]uuid.UUID, error) {
	return map[string]uuid.UUID{}, s.err
}

type jobsStub struct{ err error }

func (s jobsStub) CreateJobs(context.Context, map[string]uuid.UUID) error { return s.err }

type orthancStub struct {
	props                []dto.OrthancDicomProperties
	uploadErr, deleteErr error
	deleted              []string
	cleanupErr           error
	hasDeadline          bool
}

func (s *orthancStub) UploadInstances(context.Context, []byte) ([]dto.OrthancDicomProperties, error) {
	return s.props, s.uploadErr
}
func (s *orthancStub) GetDicomProperties(context.Context, string) (dto.OrthancDicomProperties, error) {
	return s.props[0], nil
}
func (s *orthancStub) DeleteInstances(ctx context.Context, ids []string) error {
	s.deleted = append(s.deleted, ids...)
	s.cleanupErr = ctx.Err()
	_, s.hasDeadline = ctx.Deadline()
	return s.deleteErr
}

func TestUploadCompensation(t *testing.T) {
	failure := errors.New("operation failed")
	cleanupFailure := errors.New("cleanup failed")
	for _, tc := range []struct {
		name                                                                    string
		uploadErr, beginErr, saveErr, workerErr, jobsErr, commitErr, cleanupErr error
		cancel, existingOnly, noSync                                            bool
	}{
		{name: "success"},
		{name: "metadata failure", uploadErr: failure},
		{name: "begin failure", beginErr: failure},
		{name: "save failure", saveErr: failure},
		{name: "worker failure", workerErr: failure},
		{name: "jobs failure", jobsErr: failure},
		{name: "commit failure", commitErr: failure},
		{name: "cancelled request", saveErr: failure, cancel: true},
		{name: "cleanup failure preserves both errors", saveErr: failure, cleanupErr: cleanupFailure},
		{name: "existing instances preserved", saveErr: failure, existingOnly: true},
		{name: "external upload preserved", saveErr: failure, noSync: true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			m, err := metrics.New("test")
			if err != nil {
				t.Fatal(err)
			}
			logger := zerolog.Nop()
			o := &orthancStub{
				props: []dto.OrthancDicomProperties{
					{ID: "new", Created: !tc.existingOnly}, {ID: "existing"},
					{ID: "new", Created: !tc.existingOnly},
				},
				uploadErr: tc.uploadErr, deleteErr: tc.cleanupErr,
			}
			uc := &Usecase{log: &logger, metrics: m,
				uow: transactionStub{tc.beginErr, tc.commitErr}, dicomRepo: repoStub{tc.saveErr},
				worker: workerStub{tc.workerErr}, jobCreator: jobsStub{tc.jobsErr}, dicomer: o,
			}
			ctx, cancel := context.WithCancel(context.Background())
			defer cancel()
			if tc.cancel {
				cancel()
			}
			_, err = uc.UploadDicomFiles(ctx, DicomUploadRequest{
				SyncOrthanc: !tc.noSync, RawDicoms: []RawDicomData{{InstanceID: "external", FileName: "test.dcm"}},
			})
			wantError := tc.name != "success"
			if (err != nil) != wantError {
				t.Fatalf("error = %v", err)
			}
			if wantError && !errors.Is(err, failure) {
				t.Fatalf("original error lost: %v", err)
			}
			if tc.cleanupErr != nil && !errors.Is(err, cleanupFailure) {
				t.Fatalf("cleanup error lost: %v", err)
			}
			var wantDeleted []string
			if wantError && !tc.existingOnly && !tc.noSync {
				wantDeleted = []string{"new"}
			}
			if !reflect.DeepEqual(o.deleted, wantDeleted) {
				t.Fatalf("deleted %v, want %v", o.deleted, wantDeleted)
			}
			if len(o.deleted) > 0 && (o.cleanupErr != nil || !o.hasDeadline) {
				t.Fatalf("cleanup context: err=%v, deadline=%v", o.cleanupErr, o.hasDeadline)
			}
		})
	}
}

func (s repoStub) GetByIDForUpdate(context.Context, string) (storage.Dicom, error) {
	return storage.Dicom{}, nil
}

func (s jobsStub) GetActiveDicomIDs(context.Context, []string) ([]string, error) {
	return nil, nil
}
