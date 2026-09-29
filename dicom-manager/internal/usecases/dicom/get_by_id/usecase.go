package get_by_id

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/rs/zerolog"
	"github.com/yogenyslav/ldt-2026/dicom-manager/internal/api/user/model"
	storage "github.com/yogenyslav/ldt-2026/dicom-manager/internal/storage/dicom"
	"github.com/yogenyslav/ldt-2026/dicom-manager/pkg/observability"
)

var (
	// ErrDicomForbidden ошибка, возвращаемая при попытке доступа к DICOM-файлу, если пользователь не является его создателем.
	ErrDicomForbidden = errors.New("dicom file is forbidden")
	// ErrDicomNotFound ошибка, возвращаемая при отсутствии DICOM-файла в БД.
	ErrDicomNotFound = errors.New("dicom file not found")
)

type dicomRepo interface {
	GetByID(ctx context.Context, dicomID string) (storage.Dicom, error)
}

// Usecase структура для обработки бизнес-логики получения DICOM-файла.
type Usecase struct {
	log       *zerolog.Logger
	metrics   observability.MetricsClient
	dicomRepo dicomRepo
}

// New создает новый экземпляр Usecase.
func New(l *zerolog.Logger, m observability.MetricsClient, dicomRepo dicomRepo) *Usecase {
	return &Usecase{
		log:       l,
		metrics:   m,
		dicomRepo: dicomRepo,
	}
}

// GetByID реализует бизнес-логику получения DICOM-файла по его ID.
func (uc *Usecase) GetByID(ctx context.Context, in GetDicomRequest) (storage.Dicom, error) {
	uc.metrics.Counter("usecases.dicom.get_by_id.total").Inc()

	dicom, err := uc.dicomRepo.GetByID(ctx, in.DicomID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			uc.metrics.Counter("usecases.dicom.get_by_id.not_found").Inc()
			uc.log.Warn().Err(err).Msg("dicom file not found by ID")
			return storage.Dicom{}, ErrDicomNotFound
		}
		uc.metrics.Counter("usecases.dicom.get_by_id.error").Inc()
		uc.log.Error().Err(err).Msg("failed to get dicom file by ID")
		return storage.Dicom{}, err
	}

	if dicom.CreatorID != in.RequesterID && in.RequesterRole != model.UserRoleAdmin {
		uc.metrics.Counter("usecases.dicom.get_by_id.forbidden").Inc()
		uc.log.Warn().Msg("dicom file access forbidden")
		return storage.Dicom{}, ErrDicomForbidden
	}

	uc.metrics.Counter("usecases.dicom.get_by_id.ok").Inc()
	return dicom, nil
}
