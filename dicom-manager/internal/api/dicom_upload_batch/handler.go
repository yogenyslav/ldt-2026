package dicom_upload_batch

import (
	"github.com/gofiber/fiber/v3"
	"github.com/rs/zerolog"
	"github.com/yogenyslav/ldt-2026/dicom-manager/pkg/observability"
)

// Handler обработчик для загрузки DICOM файлов батчами.
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

// DicomUploadBatch обработчик для загрузки DICOM файлов батчами.
//
//	@Summary		Загрузить DICOM файлы батчами
//	@Description	Загрузить несколько DICOM файлов на сервер в одном запросе.
//	@Tags			dicom
//	@Accept			multipart/form-data
//	@Produce		json
//	@Param			files	formData	file				true	".zip архив с DICOM файлами для загрузки."
//	@Success		201		{object}	DicomUploadBatchOut	"Файлы успешно загружены."
//	@Failure		400		string		"Некорректный запрос."
//	@Failure		500		string		"Внутренняя ошибка сервера."
//	@Router			/dicom/upload/batch [post]
func (h *Handler) DicomUploadBatch(c fiber.Ctx) error {
	return c.SendStatus(fiber.StatusNotImplemented)
}
