package report_get_by_id

import (
	"github.com/gofiber/fiber/v3"
	"github.com/rs/zerolog"
	"github.com/yogenyslav/ldt-2026/dicom-manager/pkg/observability"
)

// Handler обработчик для получения отчетов по результатам обработки DICOM-файлов.
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

// ReportGetPaginated обработчик для получения отчетов по результатам обработки DICOM-файлов.
//
//	@Summary		Получить отчеты по результатам обработки DICOM-файлов.
//	@Description	Получить отчеты по результатам обработки DICOM-файлов с пагинацией.
//	@Tags			report
//	@Accept			json
//	@Produce		json
//	@Param			offset	query		int						true	"Offset для пагинации (по умолчанию 0)"
//	@Param			limit	query		int						true	"Limit для пагинации (по умолчанию 10)"
//	@Success		200		{object}	ReportGetPaginatedOut	"Отчеты по результатам обработки DICOM-файлов успешно получены."
//	@Failure		400		string		"Некорректный запрос."
//	@Failure		403		string		"Доступ запрещен."
//	@Failure		500		string		"Внутренняя ошибка сервера."
//	@Router			/report [get]
func (h *Handler) ReportGetPaginated(c fiber.Ctx) error {
	return c.SendStatus(fiber.StatusNotImplemented)
}
