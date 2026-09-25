package dicom_upload

import (
	"github.com/gofiber/fiber/v3"
	"github.com/rs/zerolog"
	"github.com/yogenyslav/ldt-2026/dicom-manager/pkg/observability"
)

// Handler обработчик для загрузки DICOM файлов.
type Handler struct {
	log     *zerolog.Logger
	metrics observability.MetricsClient
}

// New создает новый экземпляр Handler.
func New(log *zerolog.Logger, metrics observability.MetricsClient) *Handler {
	return &Handler{
		log:     log,
		metrics: metrics,
	}
}

// DicomUpload обработчик для загрузки DICOM файлов.
//
//	@Summary		Загрузить DICOM файл
//	@Description	Загрузить DICOM файл на сервер.
//	@Tags			dicom
//	@Accept			multipart/form-data
//	@Produce		json
//	@Param			file	formData	file			true	"DICOM файл для загрузки."
//	@Success		201		{object}	DicomUploadOut	"Файл успешно загружен."
//	@Failure		400		string		"Некорректный запрос."
//	@Failure		500		string		"Внутренняя ошибка сервера."
//	@Router			/dicom/upload [post]
func (h *Handler) DicomUpload(c fiber.Ctx) error {
	return c.SendStatus(fiber.StatusNotImplemented)
}
