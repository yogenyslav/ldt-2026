package switch_training

import (
	"context"

	"github.com/gofiber/fiber/v3"
	"github.com/rs/zerolog"
	"github.com/yogenyslav/ldt-2026/dicom-manager/internal/api/annotation/common"
	"github.com/yogenyslav/ldt-2026/dicom-manager/internal/api/annotation/model"
	"github.com/yogenyslav/ldt-2026/dicom-manager/pkg/jwt"
	"github.com/yogenyslav/ldt-2026/dicom-manager/pkg/observability"
)

type usecase interface {
	SwitchTraining(ctx context.Context, claims jwt.TokenClaims, models []string) error
}

// Handler обрабатывает запрос переключения версии модели.
type Handler struct {
	log     *zerolog.Logger
	metrics observability.MetricsClient
	uc      usecase
}

// New создаёт обработчик.
func New(log *zerolog.Logger, metrics observability.MetricsClient, uc usecase) *Handler {
	return &Handler{
		log:     log,
		metrics: metrics,
		uc:      uc,
	}
}

// SwitchTraining резервирует маршрут переключения на обученную версию.
//
//	@Summary		Запросить переключение версии модели
//	@Description	До появления новых обученных версий возвращает 404.
//	@Tags			annotation
//	@Accept			json
//	@Produce		json
//	@Param			models				body		model.ModelsRequest	true	"Выбранные модели"
//	@Failure		400,401,403,404,500	{object}	model.ErrorResponse
//	@Router			/annotation/training/switch [post]
func (h *Handler) SwitchTraining(c fiber.Ctx) error {
	claims, err := common.Claims(c, h.metrics)
	if err != nil {
		return common.Fail(h.log, h.metrics, err)
	}

	var in model.ModelsRequest
	if err = c.Bind().JSON(&in); err != nil {
		return common.Fail(h.log, h.metrics, fiber.NewError(fiber.StatusBadRequest, "Некорректный список моделей"))
	}

	if err = h.uc.SwitchTraining(c.Context(), claims, in.Models); err != nil {
		return common.Fail(h.log, h.metrics, err)
	}

	return c.SendStatus(fiber.StatusNoContent)
}
