package get_by_id

import (
	"context"
	"errors"

	"github.com/gofiber/fiber/v3"
	"github.com/rs/zerolog"
	"github.com/yogenyslav/ldt-2026/dicom-manager/internal/api/user/model"
	storage "github.com/yogenyslav/ldt-2026/dicom-manager/internal/storage/dicom"
	"github.com/yogenyslav/ldt-2026/dicom-manager/internal/usecases/dicom/get_by_id"
	"github.com/yogenyslav/ldt-2026/dicom-manager/pkg/jwt"
	"github.com/yogenyslav/ldt-2026/dicom-manager/pkg/observability"
)

type usecase interface {
	GetByID(ctx context.Context, in get_by_id.GetDicomRequest) (storage.Dicom, error)
}

// Handler обработчик для получения DICOM-файла.
type Handler struct {
	log     *zerolog.Logger
	metrics observability.MetricsClient
	uc      usecase
}

// New создает новый обработчик для получения DICOM-файла.
func New(log *zerolog.Logger, metrics observability.MetricsClient, uc usecase) *Handler {
	return &Handler{
		log:     log,
		metrics: metrics,
		uc:      uc,
	}
}

// GetByID обработчик для получения DICOM-файла.
//
//	@Summary		Получить DICOM-файл
//	@Description	Получить DICOM-файл по его идентификатору, включая метаданные пациента и аппарата, без updated_at.
//	@Tags			dicom
//	@Accept			json
//	@Produce		json
//	@Param			dicom_id	path		string		true	"DICOM ID"
//	@Success		200			{object}	GetByIDOut	"DICOM-файл успешно получен."
//	@Failure		400			string		"Некорректный запрос."
//	@Failure		403			string		"Доступ запрещен."
//	@Failure		404			string		"DICOM-файл не найден."
//	@Failure		500			string		"Внутренняя ошибка сервера."
//	@Router			/dicom/{dicom_id} [get]
func (h *Handler) GetByID(c fiber.Ctx) error {
	dicomID := c.Params("dicom_id")
	if dicomID == "" {
		h.log.Warn().Msg("dicom_id is empty")
		return fiber.NewError(fiber.StatusBadRequest, "dicom_id is required")
	}

	claims, ok := c.Locals("tokenClaims").(jwt.TokenClaims)
	if !ok {
		return fiber.NewError(fiber.StatusUnauthorized, "invalid token claims")
	}

	dicom, err := h.uc.GetByID(
		c.Context(), get_by_id.GetDicomRequest{
			DicomID:       dicomID,
			RequesterID:   claims.UserID,
			RequesterRole: model.UserRole(claims.Role),
		},
	)
	if err != nil {
		if errors.Is(err, get_by_id.ErrDicomForbidden) {
			h.log.Warn().Err(err).Msg("access to dicom file is forbidden")
			return fiber.NewError(fiber.StatusForbidden, "access to dicom file is forbidden")
		}
		if errors.Is(err, get_by_id.ErrDicomNotFound) {
			h.log.Warn().Err(err).Msg("dicom file not found")
			return fiber.NewError(fiber.StatusNotFound, "dicom file not found")
		}
		h.log.Error().Err(err).Msg("failed to get dicom by ID")
		return fiber.NewError(fiber.StatusInternalServerError, "failed to get dicom by ID")
	}

	return c.JSON(GetByIDOut(dicom))
}
