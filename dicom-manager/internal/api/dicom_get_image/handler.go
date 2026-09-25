package dicom_get_image

import (
	"github.com/gofiber/fiber/v3"
	"github.com/rs/zerolog"
	"github.com/yogenyslav/ldt-2026/dicom-manager/pkg/observability"
)

// Handler обработчик для получения изображения DICOM.
type Handler struct {
	log     *zerolog.Logger
	metrics observability.MetricsClient
}

// New создает новый обработчик для получения изображения DICOM.
func New(log *zerolog.Logger, metrics observability.MetricsClient) *Handler {
	return &Handler{
		log:     log,
		metrics: metrics,
	}
}

// DicomGetImage обработчик для получения изображения DICOM.
//
//	@Summary		Получить изображение DICOM
//	@Description	Получить изображение DICOM по его идентификатору. Можно указать флаг raw, чтобы получить байты изображения вместо base64.
//	@Tags			dicom
//	@Accept			json
//	@Produce		json
//	@Param			dicom_id	path		string				true	"DICOM ID"
//	@Param			raw			query		bool				false	"Флаг, указывающий, что нужно вернуть байты изображения вместо base64."
//	@Success		200			{object}	DicomGetImageOut	"DICOM изображение успешно получено."
//	@Failure		400			string		"Некорректный запрос."
//	@Failure		403			string		"Доступ запрещен."
//	@Failure		404			string		"DICOM изображение не найдено."
//	@Failure		500			string		"Внутренняя ошибка сервера."
//	@Router			/dicom/{dicom_id}/image [get]
func (h *Handler) DicomGetImage(c fiber.Ctx) error {
	return c.SendStatus(fiber.StatusNotImplemented)
}
