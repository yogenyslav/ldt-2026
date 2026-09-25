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

// ReportGetByID обработчик для получения отчета по результатам обработки DICOM-файлов.
//
//	@Summary		Получить отчет по результатам обработки DICOM-файлов.
//	@Description	Получить отчет по результатам обработки DICOM-файлов по ID.
//	@Tags			report
//	@Accept			json
//	@Produce		json
//	@Param			report_id	query		string				true	"ID отчета по результатам обработки DICOM-файлов"
//	@Success		200			{object}	ReportGetByIDOut	"Отчет по результатам обработки DICOM-файлов успешно получены."
//	@Failure		400			string		"Некорректный запрос."
//	@Failure		403			string		"Доступ запрещен."
//	@Failure		404			string		"Отчет не найден."
//	@Failure		500			string		"Внутренняя ошибка сервера."
//	@Router			/report/{report_id} [get]
func (h *Handler) ReportGetByID(c fiber.Ctx) error {
	return c.SendStatus(fiber.StatusNotImplemented)
}
