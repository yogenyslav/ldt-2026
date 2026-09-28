package get_by_dicom_id

import (
	"context"
	"errors"
	"testing"

	"github.com/jackc/pgx/v5"
	"github.com/rs/zerolog"
	"github.com/yogenyslav/ldt-2026/dicom-manager/internal/api/user/model"
	dicomstorage "github.com/yogenyslav/ldt-2026/dicom-manager/internal/storage/dicom"
	storage "github.com/yogenyslav/ldt-2026/dicom-manager/internal/storage/job"
	"github.com/yogenyslav/ldt-2026/dicom-manager/pkg/observability/metrics"
)

type dicomStub struct{ err error }

func (s dicomStub) GetByID(context.Context, string) (dicomstorage.Dicom, error) {
	return dicomstorage.Dicom{CreatorID: 1}, s.err
}

type jobStub struct {
	called bool
	err    error
	jobs   []storage.DicomJobResult
}

func (s *jobStub) GetJobsByDicomID(_ context.Context, id string) ([]storage.DicomJobResult, error) {
	s.called = true
	if id != "dicom" {
		panic("wrong DICOM ID")
	}
	return s.jobs, s.err
}

func TestGetByDicomIDAccess(t *testing.T) {
	failure := errors.New("database unavailable")
	for _, tc := range []struct {
		name                      string
		requester                 int64
		role                      model.UserRole
		dicomErr, jobErr, wantErr error
		wantQuery                 bool
	}{
		{name: "owner", requester: 1, wantQuery: true},
		{name: "admin", requester: 2, role: model.UserRoleAdmin, wantQuery: true},
		{name: "foreign user", requester: 2, wantErr: ErrDicomForbidden},
		{name: "missing DICOM", dicomErr: pgx.ErrNoRows, wantErr: ErrDicomNotFound},
		{name: "DICOM query failure", dicomErr: failure, wantErr: failure},
		{name: "jobs query failure", requester: 1, jobErr: failure, wantErr: failure, wantQuery: true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			logger := zerolog.Nop()
			m, err := metrics.New("test")
			if err != nil {
				t.Fatal(err)
			}
			repo := &jobStub{err: tc.jobErr}
			uc := New(&logger, m, repo, dicomStub{tc.dicomErr})
			jobs, err := uc.GetByDicomID(context.Background(), GetJobsRequest{DicomID: "dicom", RequesterID: tc.requester, RequesterRole: tc.role})
			if !errors.Is(err, tc.wantErr) || repo.called != tc.wantQuery {
				t.Fatalf("err=%v queried=%v", err, repo.called)
			}
			if err == nil && (jobs == nil || len(jobs) != 0) {
				t.Fatalf("expected empty list: %v", jobs)
			}
		})
	}
}
