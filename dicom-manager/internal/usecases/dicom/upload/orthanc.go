package upload

import (
	"context"
	"errors"
	"time"

	storage "github.com/yogenyslav/ldt-2026/dicom-manager/internal/storage/dicom"
	"github.com/yogenyslav/ldt-2026/dicom-manager/pkg/database"
)

// RegisterOrthanc сохраняет метаданные уже загруженного в Orthanc файла без внешних вызовов.
func (uc *Usecase) RegisterOrthanc(ctx context.Context, file storage.Dicom) error {
	file.UploadSource = storage.UploadSourceClinic
	return uc.uow.WithTx(ctx, database.TxLevelReadCommitted, func(ctx context.Context) error {
		if err := uc.dicomRepo.SaveDicomFiles(ctx, []storage.Dicom{file}); err != nil {
			return err
		}

		return uc.lockDicoms(ctx, []string{file.ID}, file.CreatorID, file.OrganizationID)
	})
}

// StartOrthanc запускается отдельным запросом после получения Orthanc ответа 201.
func (uc *Usecase) StartOrthanc(ctx context.Context, id string, creatorID, organizationID int64) error {
	// Не ждём блокировку фоновой обработки при повторном запросе.
	file, err := uc.dicomRepo.GetByID(ctx, id)
	if err != nil {
		return err
	}

	if file.CreatorID != creatorID || file.OrganizationID != organizationID {
		return ErrDicomForbidden
	}

	go func() {
		// Контекст запроса и его транзакция не должны жить в фоновой задаче.
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
		defer cancel()
		err := uc.uow.WithTx(ctx, database.TxLevelReadCommitted, func(ctx context.Context) error {
			if err := uc.lockDicoms(ctx, []string{id}, creatorID, organizationID); err != nil {
				return err
			}
			_, err := uc.processDicoms(ctx, []string{id})
			return err
		})
		if err != nil && !errors.Is(err, ErrActiveJob) {
			uc.log.Error().Err(err).Str("dicom_id", id).Msg("failed to process Orthanc DICOM")
			uc.metrics.Counter("usecases.dicom.upload.orthanc_async.error").Inc()
		}
	}()

	return nil
}
