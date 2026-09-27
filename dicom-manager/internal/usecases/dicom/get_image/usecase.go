package get_image

import (
	"context"
	"encoding/base64"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/rs/zerolog"
	"github.com/yogenyslav/ldt-2026/dicom-manager/internal/api/user/model"
	"github.com/yogenyslav/ldt-2026/dicom-manager/internal/generated/orthanc"
	storage "github.com/yogenyslav/ldt-2026/dicom-manager/internal/storage/dicom"
	"github.com/yogenyslav/ldt-2026/dicom-manager/internal/usecases/dicom/get_image/wrappers"
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

type dicomer interface {
	GetImageByID(ctx context.Context, dicomID string) ([]byte, error)
}

// Usecase структура для обработки бизнес-логики получения DICOM-изображения.
type Usecase struct {
	log       *zerolog.Logger
	metrics   observability.MetricsClient
	dicomer   dicomer
	dicomRepo dicomRepo
}

// New создает новый экземпляр Usecase.
func New(l *zerolog.Logger, m observability.MetricsClient, o orthanc.ClientInterface, dicomRepo dicomRepo) *Usecase {
	return &Usecase{
		log:       l,
		metrics:   m,
		dicomer:   wrappers.NewOrthanc(o),
		dicomRepo: dicomRepo,
	}
}

// GetImageByID реализует бизнес-логику получения DICOM-изображения по его ID.
func (uc *Usecase) GetImageByID(ctx context.Context, in GetImageRequest) (ImageData, error) {
	uc.metrics.Counter("usecases.dicom.get_image.total").Inc()

	dicom, err := uc.dicomRepo.GetByID(ctx, in.DicomID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			uc.metrics.Counter("usecases.dicom.get_image.not_found").Inc()
			uc.log.Warn().Err(err).Msg("dicom file not found by ID")
			return ImageData{}, ErrDicomNotFound
		}
		uc.metrics.Counter("usecases.dicom.get_image.error").Inc()
		uc.log.Error().Err(err).Msg("failed to get dicom file by ID")
		return ImageData{}, err
	}

	if dicom.CreatorID != in.RequesterID && in.RequesterRole != model.UserRoleAdmin {
		uc.metrics.Counter("usecases.dicom.get_image.forbidden").Inc()
		uc.log.Warn().Msg("dicom file access forbidden")
		return ImageData{}, ErrDicomForbidden
	}

	image, err := uc.dicomer.GetImageByID(ctx, in.DicomID)
	if err != nil {
		uc.metrics.Counter("usecases.dicom.get_image.error").Inc()
		uc.log.Error().Err(err).Msg("failed to get image by ID")
		return ImageData{}, err
	}

	encoded := base64.StdEncoding.EncodeToString(image)
	uc.metrics.Counter("usecases.dicom.get_image.ok").Inc()

	if !in.WithRaw {
		return ImageData{
			DataBase64: encoded,
		}, nil
	}

	return ImageData{
		DataBase64: encoded,
		DataRaw:    image,
	}, nil
}
