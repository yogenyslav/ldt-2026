package upload

import (
	"archive/zip"
	"bytes"
	"context"
	"errors"
	"testing"

	"github.com/rs/zerolog"
	"github.com/stretchr/testify/require"
	storage "github.com/yogenyslav/ldt-2026/dicom-manager/internal/storage/dicom"
	"github.com/yogenyslav/ldt-2026/dicom-manager/internal/usecases/dicom/upload/wrappers/dto"
	"github.com/yogenyslav/ldt-2026/dicom-manager/pkg/observability/metrics"
)

type filenameRepo struct {
	repoStub
	saved []storage.Dicom
}

func (r *filenameRepo) SaveDicomFiles(_ context.Context, files []storage.Dicom) error {
	r.saved = files
	return nil
}

type filenameOrthanc struct {
	orthancStub
	t          *testing.T
	names      []string
	failSecond bool
}

func (o *filenameOrthanc) UploadInstances(_ context.Context, payload []byte) ([]dto.OrthancDicomProperties, error) {
	archive, err := zip.NewReader(bytes.NewReader(payload), int64(len(payload)))
	require.NoError(o.t, err)
	require.Len(o.t, archive.File, 1)
	o.names = append(o.names, archive.File[0].Name)
	// IDs deliberately sort in the opposite order to the source files.
	id := "z"
	if len(o.names) == 2 {
		id = "a"
	}
	props := []dto.OrthancDicomProperties{{ID: id, FileName: "orthanc-uuid", Created: true}}
	if o.failSecond && len(o.names) == 2 {
		return props, errors.New("metadata failure")
	}
	return props, nil
}

func TestUploadPreservesSourcePaths(t *testing.T) {
	for _, fail := range []bool{false, true} {
		t.Run(map[bool]string{false: "saved filenames", true: "rollback all uploaded files"}[fail], func(t *testing.T) {
			log := zerolog.Nop()
			m, err := metrics.New("filename_test")
			require.NoError(t, err)
			repo := &filenameRepo{}
			orthanc := &filenameOrthanc{t: t, failSecond: fail}
			uc := &Usecase{log: &log, metrics: m, uow: transactionStub{}, dicomRepo: repo, dicomer: orthanc, worker: workerStub{}, jobCreator: jobsStub{}}
			_, err = uc.UploadDicomFiles(context.Background(), DicomUploadRequest{SyncOrthanc: true, RawDicoms: []RawDicomData{
				{FileName: "снимок.dcm", Payload: []byte("first")},
				{FileName: "patient/study/снимок.dcm", Payload: []byte("second")},
			}})
			require.Equal(t, []string{"снимок.dcm", "patient/study/снимок.dcm"}, orthanc.names)
			if fail {
				require.Error(t, err)
				require.Equal(t, []string{"z", "a"}, orthanc.deleted)
				require.Empty(t, repo.saved)
			} else {
				require.NoError(t, err)
				require.Len(t, repo.saved, 2)
				require.Equal(t, "a", repo.saved[0].ID)
				require.Equal(t, "patient/study/снимок.dcm", repo.saved[0].FileName)
				require.Equal(t, "z", repo.saved[1].ID)
				require.Equal(t, "снимок.dcm", repo.saved[1].FileName)
			}
		})
	}
}
