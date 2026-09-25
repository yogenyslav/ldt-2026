package job_result_decision

import (
	"github.com/gofiber/fiber/v3"
	"github.com/rs/zerolog"
	"github.com/yogenyslav/ldt-2026/dicom-manager/pkg/observability"
)

// Handler обработчик для принятия решения по результатам обработки DICOM-файлов.
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

// JobResultDecision обработчик для принятия решения по результатам обработки DICOM-файлов.
//
//	@Summary		Принять решение по результатам обработки DICOM-файлов.
//	@Description	Принять решение по результатам обработки DICOM-файлов по их ID.
//	@Tags			job
//	@Accept			json
//	@Produce		json
//	@Param			JobResultDecision	body		JobResultDecisionIn	true	"Данные для принятия решения по результатам обработки DICOM-файлов"
//	@Success		204					{object}	string				"Решение по результатам обработки успешно принято."
//	@Failure		400					string		"Некорректный запрос."
//	@Failure		403					string		"Доступ запрещен."
//	@Failure		500					string		"Внутренняя ошибка сервера."
//	@Router			/job/result/decision [post]
func (h *Handler) JobResultDecision(c fiber.Ctx) error {
	return c.SendStatus(fiber.StatusNotImplemented)
}
