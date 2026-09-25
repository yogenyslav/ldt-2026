package job_info_get_by_id

import (
	"github.com/gofiber/fiber/v3"
	"github.com/rs/zerolog"
	"github.com/yogenyslav/ldt-2026/dicom-manager/pkg/observability"
)

// Handler обработчик для получения информации о задаче на обработку DICOM-файлов батчем.
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

// JobInfoGetByID обработчик для получения информации о задаче на обработку DICOM-файла по ID.
//
//	@Summary		Получить информацию о задаче на обработку DICOM-файла по ID
//	@Description	Получить информацию о задаче на обработку DICOM-файла по ID
//	@Tags			job
//	@Accept			json
//	@Produce		json
//	@Param			job_id	query		string				true	"ID задачи на обработку DICOM-файла"
//	@Success		200		{object}	JobInfoGetByIDOut	"Информация о задаче успешно получена."
//	@Failure		400		string		"Некорректный запрос."
//	@Failure		403		string		"Доступ запрещен."
//	@Failure		404		string		"Задача не найдена."
//	@Failure		500		string		"Внутренняя ошибка сервера."
//	@Router			/job/info/{job_id} [get]
func (h *Handler) JobInfoGetByID(c fiber.Ctx) error {
	return c.SendStatus(fiber.StatusNotImplemented)
}
