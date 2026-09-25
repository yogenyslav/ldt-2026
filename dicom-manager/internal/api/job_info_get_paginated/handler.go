package job_info_get_by_ids

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

// JobInfoGetPaginated обработчик для получения информации о задачах на обработку DICOM-файлов по их ID с пагинацией.
//
//	@Summary		Получить информацию о задачах на обработку DICOM-файлов по их ID с пагинацией
//	@Description	Получить информацию о задачах на обработку DICOM-файлов по их ID с пагинацией
//	@Tags			job
//	@Accept			json
//	@Produce		json
//	@Param			offset	query		int						false	"Offset для пагинации (по умолчанию 0)"
//	@Param			limit	query		int						false	"Limit для пагинации (по умолчанию 10)"
//	@Success		200		{object}	JobInfoGetPaginatedOut	"Информация о задачах успешно получена."
//	@Failure		400		string		"Некорректный запрос."
//	@Failure		403		string		"Доступ запрещен."
//	@Failure		500		string		"Внутренняя ошибка сервера."
//	@Router			/job/info [get]
func (h *Handler) JobInfoGetPaginated(c fiber.Ctx) error {
	return c.SendStatus(fiber.StatusNotImplemented)
}
