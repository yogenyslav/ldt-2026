package report_generate

import (
	"github.com/gofiber/fiber/v3"
	"github.com/rs/zerolog"
	"github.com/yogenyslav/ldt-2026/dicom-manager/pkg/observability"
)

// Handler обработчик для генерации отчета по результатам обработки DICOM-файлов.
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

// ReportGenerate обработчик для генерации отчета по результатам обработки DICOM-файлов.
//
//	@Summary		Сгенерировать отчет по результатам обработки DICOM-файлов.
//	@Description	Сгенерировать отчет по результатам обработки DICOM-файлов в формате .csv.
//	@Tags			report
//	@Accept			json
//	@Produce		json
//	@Param			ReportGenerateIn	body		ReportGenerateIn	true	"ID для генерации отчета по результатам обработки DICOM-файлов"
//	@Success		200					{object}	ReportGenerateOut	"Отчет по результатам обработки DICOM-файлов успешно сгенерирован."
//	@Failure		400					string		"Некорректный запрос."
//	@Failure		403					string		"Доступ запрещен."
//	@Failure		500					string		"Внутренняя ошибка сервера."
//	@Router			/report/generate [post]
func (h *Handler) ReportGenerate(c fiber.Ctx) error {
	return c.SendStatus(fiber.StatusNotImplemented)
}
