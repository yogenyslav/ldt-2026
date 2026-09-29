package upload

import (
	"context"
	"testing"

	"github.com/rs/zerolog"
	"github.com/stretchr/testify/require"
	storage "github.com/yogenyslav/ldt-2026/dicom-manager/internal/storage/dicom"
	"github.com/yogenyslav/ldt-2026/dicom-manager/internal/usecases/dicom/upload/wrappers/dto"
	"github.com/yogenyslav/ldt-2026/dicom-manager/pkg/observability/metrics"
)

func TestUploadSource(t *testing.T) {
	for _, tc := range []struct {
		name, role, want string
		syncOrthanc      bool
	}{
		{"admin UI", "admin", storage.UploadSourceManual, true},
		{"specialist UI", "specialist", storage.UploadSourceClinic, true},
		{"admin Orthanc", "admin", storage.UploadSourceClinic, false},
		{"specialist Orthanc", "specialist", storage.UploadSourceClinic, false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			log := zerolog.Nop()
			m, err := metrics.New("source_test")
			require.NoError(t, err)
			repo := &filenameRepo{}
			uc := &Usecase{
				log: &log, metrics: m, uow: transactionStub{}, dicomRepo: repo,
				dicomer: &orthancStub{props: []dto.OrthancDicomProperties{{ID: "dicom"}}},
				worker:  workerStub{}, jobCreator: jobsStub{},
			}
			_, err = uc.UploadDicomFiles(context.Background(), DicomUploadRequest{
				CreatorRole: tc.role, SyncOrthanc: tc.syncOrthanc,
				RawDicoms: []RawDicomData{{FileName: "scan.dcm", InstanceID: "dicom", Payload: []byte("DICOM")}},
			})
			require.NoError(t, err)
			require.Len(t, repo.saved, 1)
			require.Equal(t, tc.want, repo.saved[0].UploadSource)
		})
	}
}
