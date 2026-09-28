package upload

import (
	"archive/zip"
	"bytes"
	"cmp"
	"context"
	"errors"
	"fmt"
	"maps"
	"slices"
	"time"
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

var (
	// ErrActiveJob означает, что обработка файла ещё не завершена.
	ErrActiveJob = errors.New("dicom already has an active job")
	// ErrDicomForbidden означает, что файл принадлежит другому пользователю или организации.
	ErrDicomForbidden = errors.New("dicom file is not accessible by the user")
)

type dicomRepo interface {
	GetByID(ctx context.Context, id string) (storage.Dicom, error)
	GetByIDForUpdate(ctx context.Context, id string) (storage.Dicom, error)
	SaveDicomFiles(ctx context.Context, dicoms []storage.Dicom) error
}

type worker interface {
	ProcessDicomFiles(ctx context.Context, dicomIDs []string) (map[string]uuid.UUID, error)
}

type jobCreator interface {
	GetActiveDicomIDs(ctx context.Context, dicomIDs []string) ([]string, error)
	CreateJobs(ctx context.Context, dicomJobs map[string]uuid.UUID) error
}

type dicomer interface {
	UploadInstances(ctx context.Context, dicoms []byte) ([]dto.OrthancDicomProperties, error)
	GetDicomProperties(ctx context.Context, dicomID string) (dto.OrthancDicomProperties, error)
	DeleteInstances(ctx context.Context, ids []string) error
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
) (_ map[string]uuid.UUID, err error) {
	uc.metrics.Counter("usecases.dicom.upload.total").Inc()

	var dicomJobs map[string]uuid.UUID

	dicomProperties, err := uc.getDicomProperties(ctx, in.RawDicoms, in.SyncOrthanc)
	defer func() {
		if err == nil || !in.SyncOrthanc {
			return
		}
		if rollbackErr := uc.rollbackDicomUpload(ctx, dicomProperties); rollbackErr != nil {
			uc.log.Error().Err(rollbackErr).Msg("failed to rollback DICOM upload")
			uc.metrics.Counter("usecases.dicom.upload.rollback.error").Inc()
			err = errors.Join(err, fmt.Errorf("rollback DICOM upload: %w", rollbackErr))
		}
	}()
	if err != nil {
		uc.log.Error().Err(err).Msg("failed to get DICOM properties")
		uc.metrics.Counter("usecases.dicom.upload.get_properties.error").Inc()
		return nil, fmt.Errorf("failed to get DICOM properties: %w", err)
	}

	source := storage.UploadSourceOrthanc
	if in.SyncOrthanc {
		source = storage.UploadSourceManual
	}

	saveDicoms := make([]storage.Dicom, 0, len(dicomProperties))
	dicomIDs := make([]string, 0, len(saveDicoms))
	seen := make(map[string]bool)
	for _, prop := range dicomProperties {
		if seen[prop.ID] {
			continue
		}
		seen[prop.ID] = true
		dicomIDs = append(dicomIDs, prop.ID)
		saveDicoms = append(
			saveDicoms, storage.Dicom{
				UploadSource:   source,
				DeviceModel:    prop.DeviceModel,
				PatientID:      prop.PatientID,
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

	// Единый порядок вставки и блокировок предотвращает взаимные блокировки батчей.
	slices.SortFunc(saveDicoms, func(a, b storage.Dicom) int { return cmp.Compare(a.ID, b.ID) })
	slices.Sort(dicomIDs)

	err = uc.uow.WithTx(
		ctx, database.TxLevelReadCommitted, func(ctx context.Context) error {
			errSaveDicoms := uc.dicomRepo.SaveDicomFiles(ctx, saveDicoms)
			if errSaveDicoms != nil {
				uc.metrics.Counter("usecases.dicom.upload.save.error").Inc()
				return fmt.Errorf("failed to save DICOM files: %w", errSaveDicoms)
			}

			if err := uc.lockDicoms(ctx, dicomIDs, in.CreatorID, in.OrganizationID); err != nil {
				return err
			}

			var err error
			dicomJobs, err = uc.processDicoms(ctx, dicomIDs)
			return err
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

func (uc *Usecase) getDicomProperties(ctx context.Context, dicoms []RawDicomData, syncOrthanc bool) (
	[]dto.OrthancDicomProperties, error,
) {
	var (
		dicomProperties  []dto.OrthancDicomProperties
		errGetProperties error
	)

	if syncOrthanc {
		dicomsZip, errZipDicoms := dicomsToZip(dicoms)
		if errZipDicoms != nil {
			uc.metrics.Counter("usecases.dicom.upload.zip.error").Inc()
			return nil, fmt.Errorf("failed to create zip from dicoms: %w", errZipDicoms)
		}

		dicomProperties, errGetProperties = uc.dicomer.UploadInstances(ctx, dicomsZip)
		if errGetProperties != nil {
			uc.metrics.Counter("usecases.dicom.upload.orthanc.error").Inc()
			return dicomProperties, fmt.Errorf("failed to upload dicoms to orthanc: %w", errGetProperties)
		}
	} else {
		singleDicomProp, err := uc.dicomer.GetDicomProperties(ctx, dicoms[0].InstanceID)
		if err != nil {
			uc.metrics.Counter("usecases.dicom.upload.orthanc.error").Inc()
			return nil, fmt.Errorf("failed to get dicom properties from orthanc: %w", err)
		}
		dicomProperties = []dto.OrthancDicomProperties{singleDicomProp}
	}

	return dicomProperties, nil
}

func (uc *Usecase) rollbackDicomUpload(ctx context.Context, dicoms []dto.OrthancDicomProperties) error {
	ids := make([]string, 0, len(dicoms))
	seen := make(map[string]bool)
	for _, dicom := range dicoms {
		if dicom.Created && dicom.ID != "" && !seen[dicom.ID] {
			ids = append(ids, dicom.ID)
			seen[dicom.ID] = true
		}
	}

	if len(ids) == 0 {
		return nil
	}

	// Очистка должна выполняться даже после отмены исходного запроса загрузки.
	cleanupCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 30*time.Second)
	defer cancel()

	return uc.dicomer.DeleteInstances(cleanupCtx, ids)
}

func dicomsToZip(dicoms []RawDicomData) ([]byte, error) {
	buf := bytes.NewBuffer(nil)
	zipWriter := zip.NewWriter(buf)

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

	if err := zipWriter.Close(); err != nil {
		return nil, fmt.Errorf("failed to finalize dicom zip: %w", err)
	}

	return buf.Bytes(), nil
}

// lockDicoms проверяет владельца под блокировкой внутри транзакции.
func (uc *Usecase) lockDicoms(ctx context.Context, dicomIDs []string, creatorID, organizationID int64) error {
	for _, id := range dicomIDs {
		stored, err := uc.dicomRepo.GetByIDForUpdate(ctx, id)
		if err != nil {
			return fmt.Errorf("lock DICOM file: %w", err)
		}

		if stored.CreatorID != creatorID || stored.OrganizationID != organizationID {
			return ErrDicomForbidden
		}
	}

	return nil
}

// processDicoms вызывается внутри транзакции после блокировки файлов.
func (uc *Usecase) processDicoms(ctx context.Context, dicomIDs []string) (map[string]uuid.UUID, error) {
	// Проверяем весь батч после блокировки всех файлов в текущей транзакции.
	active, err := uc.jobCreator.GetActiveDicomIDs(ctx, dicomIDs)
	if err != nil {
		return nil, fmt.Errorf("check active DICOM jobs: %w", err)
	}

	activeIDs := make(map[string]struct{}, len(active))
	for _, id := range active {
		activeIDs[id] = struct{}{}
	}

	readyIDs := make([]string, 0, len(dicomIDs))
	for _, id := range dicomIDs {
		if _, busy := activeIDs[id]; !busy {
			readyIDs = append(readyIDs, id)
		}
	}
	if len(readyIDs) == 0 {
		return nil, ErrActiveJob
	}

	dicomToJobs, errProcessDicoms := uc.worker.ProcessDicomFiles(ctx, readyIDs)
	if errProcessDicoms != nil {
		uc.metrics.Counter("usecases.dicom.upload.process.error").Inc()
		return nil, fmt.Errorf("failed to process DICOM files: %w", errProcessDicoms)
	}

	errCreateJobs := uc.jobCreator.CreateJobs(ctx, dicomToJobs)
	if errCreateJobs != nil {
		uc.metrics.Counter("usecases.dicom.upload.create_jobs.error").Inc()
		return nil, fmt.Errorf("failed to create DICOM jobs: %w", errCreateJobs)
	}

	return maps.Clone(dicomToJobs), nil
}
