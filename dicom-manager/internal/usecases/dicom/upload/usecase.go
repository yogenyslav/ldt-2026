package upload

import (
	"archive/zip"
	"bytes"
	"context"
	"fmt"
	"maps"
	"uuid"

	"github.com/rs/zerolog"
	dicom_worker "github.com/yogenyslav/ldt-2026/dicom-manager/internal/generated/dicom-worker"
	"github.com/yogenyslav/ldt-2026/dicom-manager/internal/generated/orthanc"
	storage "github.com/yogenyslav/ldt-2026/dicom-manager/internal/storage/dicom"
	"github.com/yogenyslav/ldt-2026/dicom-manager/internal/usecases/dicom/upload/wrappers"
	"github.com/yogenyslav/ldt-2026/dicom-manager/internal/usecases/dicom/upload/wrappers/dto"
	"github.com/yogenyslav/ldt-2026/dicom-manager/pkg/database"
	"github.com/yogenyslav/ldt-2026/dicom-manager/pkg/observability"
)

type dicomRepo interface {
	SaveDicomFiles(ctx context.Context, dicoms []storage.Dicom) error
}

type worker interface {
	ProcessDicomFiles(ctx context.Context, dicomIDs []string) (map[string]uuid.UUID, error)
}

type jobCreator interface {
	CreateJobs(ctx context.Context, dicomJobs map[string]uuid.UUID) error
}

type dicomer interface {
	UploadInstances(ctx context.Context, dicoms []byte) ([]dto.OrthancDicomProperties, error)
	GetDicomProperties(ctx context.Context, dicomID string) (dto.OrthancDicomProperties, error)
}

type orthancClient interface {
	Client() orthanc.ClientInterface
}

// Usecase структура для реализации бизнес-логики загрузки DICOM-файлов.
type Usecase struct {
	log        *zerolog.Logger
	metrics    observability.MetricsClient
	uow        database.UnitOfWork
	dicomRepo  dicomRepo
	worker     worker
	jobCreator jobCreator
	dicomer    dicomer
}

// New создает новый экземпляр Usecase.
func New(
	l *zerolog.Logger, m observability.MetricsClient, uow database.UnitOfWork,
	dr dicomRepo, jr wrappers.JobRepo, o orthancClient, workerClient dicom_worker.DicomWorkerServiceClient,
) *Usecase {
	return &Usecase{
		log:        l,
		metrics:    m,
		uow:        uow,
		dicomRepo:  dr,
		worker:     wrappers.NewWorker(workerClient),
		jobCreator: wrappers.NewJobCreator(jr),
		dicomer:    wrappers.NewOrthanc(o.Client()),
	}
}

// UploadDicomFiles реализует бизнес-логику загрузки DICOM-файлов.
func (uc *Usecase) UploadDicomFiles(
	ctx context.Context, in DicomUploadRequest,
) (map[string]uuid.UUID, error) {
	uc.metrics.Counter("usecases.dicom.upload.total").Inc()

	var dicomJobs map[string]uuid.UUID

	err := uc.uow.WithTx(
		ctx, database.TxLevelReadCommitted, func(ctx context.Context) error {

			var (
				dicomProperties  []dto.OrthancDicomProperties
				errGetProperties error
			)

			if in.SyncOrthanc {
				dicomsZip, errZipDicoms := dicomsToZip(in.RawDicoms)
				if errZipDicoms != nil {
					uc.metrics.Counter("usecases.dicom.upload.zip.error").Inc()
					return fmt.Errorf("failed to create zip from dicoms: %w", errZipDicoms)
				}

				dicomProperties, errGetProperties = uc.dicomer.UploadInstances(ctx, dicomsZip)
				if errGetProperties != nil {
					uc.metrics.Counter("usecases.dicom.upload.orthanc.error").Inc()
					return fmt.Errorf("failed to upload dicoms to orthanc: %w", errGetProperties)
				}
			} else {
				singleDicomProp, err := uc.dicomer.GetDicomProperties(ctx, in.RawDicoms[0].InstanceID)
				if err != nil {
					uc.metrics.Counter("usecases.dicom.upload.orthanc.error").Inc()
					return fmt.Errorf("failed to get dicom properties from orthanc: %w", err)
				}
				dicomProperties = []dto.OrthancDicomProperties{singleDicomProp}
			}

			saveDicoms := make([]storage.Dicom, 0, len(dicomProperties))
			dicomIDs := make([]string, 0, len(saveDicoms))
			for _, prop := range dicomProperties {
				dicomIDs = append(dicomIDs, prop.ID)
				saveDicoms = append(
					saveDicoms, storage.Dicom{
						ID:             prop.ID,
						FileName:       prop.FileName,
						SeriesID:       prop.ParentSeries,
						StudyID:        prop.ParentStudy,
						DicomStudyUid:  prop.DicomStudyUid,
						DicomSeriesUid: prop.DicomSeriesUid,
						DicomImageUid:  prop.DicomImageUid,
						CreatorID:      in.CreatorID,
						OrganizationID: in.OrganizationID,
					},
				)
			}

			errSaveDicoms := uc.dicomRepo.SaveDicomFiles(ctx, saveDicoms)
			if errSaveDicoms != nil {
				uc.metrics.Counter("usecases.dicom.upload.save.error").Inc()
				return fmt.Errorf("failed to save DICOM files: %w", errSaveDicoms)
			}

			dicomToJobs, errProcessDicoms := uc.worker.ProcessDicomFiles(ctx, dicomIDs)
			if errProcessDicoms != nil {
				uc.metrics.Counter("usecases.dicom.upload.process.error").Inc()
				return fmt.Errorf("failed to process DICOM files: %w", errProcessDicoms)
			}

			errCreateJobs := uc.jobCreator.CreateJobs(ctx, dicomToJobs)
			if errCreateJobs != nil {
				uc.metrics.Counter("usecases.dicom.upload.create_jobs.error").Inc()
				return fmt.Errorf("failed to create DICOM jobs: %w", errCreateJobs)
			}

			dicomJobs = maps.Clone(dicomToJobs)

			return nil
		},
	)
	if err != nil {
		uc.log.Error().Err(err).Msg("failed to upload DICOM files")
		uc.metrics.Counter("usecases.dicom.upload.error").Inc()
		return nil, fmt.Errorf("transaction failed: %w", err)
	}

	uc.metrics.Counter("usecases.dicom.upload.ok").Inc()
	return dicomJobs, nil
}

func dicomsToZip(dicoms []RawDicomData) ([]byte, error) {
	buf := bytes.NewBuffer(nil)
	zipWriter := zip.NewWriter(buf)
	defer zipWriter.Close()

	for _, dicom := range dicoms {
		w, err := zipWriter.Create(dicom.FileName)
		if err != nil {
			return nil, fmt.Errorf("failed to create zip entry: %w", err)
		}
		_, err = w.Write(dicom.Payload)
		if err != nil {
			return nil, fmt.Errorf("failed to write dicom to zip: %w", err)
		}
	}

	return buf.Bytes(), nil
}
