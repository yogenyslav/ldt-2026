package get_image

import (
	"context"
	"errors"

	"github.com/gofiber/fiber/v3"
	"github.com/rs/zerolog"
	"github.com/yogenyslav/ldt-2026/dicom-manager/internal/usecases/dicom/get_image"
	"github.com/yogenyslav/ldt-2026/dicom-manager/pkg/observability"
)

type usecase interface {
	GetImageByID(ctx context.Context, in get_image.GetImageRequest) (get_image.ImageData, error)
}

// Handler обработчик для получения изображения DICOM.
type Handler struct {
	log     *zerolog.Logger
	metrics observability.MetricsClient
	uc      usecase
}

// New создает новый обработчик для получения изображения DICOM.
func New(log *zerolog.Logger, metrics observability.MetricsClient, uc usecase) *Handler {
	return &Handler{
		log:     log,
		metrics: metrics,
		uc:      uc,
	}
}

// GetImage обработчик для получения изображения DICOM.
//
//	@Summary		Получить изображение DICOM
//	@Description	Получить изображение DICOM по его идентификатору. Можно указать флаг raw, чтобы получить байты изображения вместо base64.
//	@Tags			dicom
//	@Accept			json
//	@Produce		json
//	@Param			dicom_id	path		string		true	"DICOM ID"
//	@Param			raw			query		bool		false	"Флаг, указывающий, что нужно вернуть байты изображения вместо base64."
//	@Success		200			{object}	GetImageOut	"DICOM изображение успешно получено."
//	@Failure		400			string		"Некорректный запрос."
//	@Failure		403			string		"Доступ запрещен."
//	@Failure		404			string		"DICOM изображение не найдено."
//	@Failure		500			string		"Внутренняя ошибка сервера."
//	@Router			/dicom/{dicom_id}/image [get]
func (h *Handler) GetImage(c fiber.Ctx) error {
	dicomID := c.Params("dicom_id")
	if dicomID == "" {
		h.log.Warn().Msg("dicom_id is empty")
		return fiber.NewError(fiber.StatusBadRequest, "dicom_id is required")
	}

	withRaw := c.Query("raw") == "true"

	imageData, err := h.uc.GetImageByID(
		c.Context(), get_image.GetImageRequest{
			DicomID: dicomID,
			WithRaw: withRaw,
		},
	)
	if err != nil {
		if errors.Is(err, get_image.ErrDicomForbidden) {
			h.log.Warn().Err(err).Msg("access to dicom image is forbidden")
			return fiber.NewError(fiber.StatusForbidden, "access to dicom image is forbidden")
		}
		if errors.Is(err, get_image.ErrDicomNotFound) {
			h.log.Warn().Err(err).Msg("dicom image not found")
			return fiber.NewError(fiber.StatusNotFound, "dicom image not found")
		}
		h.log.Error().Err(err).Msg("failed to get image by ID")
		return fiber.NewError(fiber.StatusInternalServerError, "failed to get image by ID")
	}

	out := convertToOut(imageData)
	return c.JSON(out)
}

func convertToOut(imageData get_image.ImageData) GetImageOut {
	return GetImageOut{
		ImageData:    imageData.DataBase64,
		ImageDataRaw: imageData.DataRaw,
	}
}
