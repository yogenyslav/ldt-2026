package get_training

import (
	"context"

	"github.com/gofiber/fiber/v3"
	"github.com/rs/zerolog"
	"github.com/yogenyslav/ldt-2026/dicom-manager/internal/api/annotation/common"
	_ "github.com/yogenyslav/ldt-2026/dicom-manager/internal/api/annotation/model"
	"github.com/yogenyslav/ldt-2026/dicom-manager/internal/usecases/annotation"
	"github.com/yogenyslav/ldt-2026/dicom-manager/pkg/jwt"
	"github.com/yogenyslav/ldt-2026/dicom-manager/pkg/observability"
)

type usecase interface {
	Training(ctx context.Context, claims jwt.TokenClaims) (annotation.TrainingResponse, error)
}

// Handler возвращает состояние дообучения.
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

// GetTraining возвращает накопленную статистику для будущего дообучения.
//
//	@Summary	Получить состояние дообучения
//	@Tags		annotation
//	@Produce	json
//	@Success	200			{object}	annotation.TrainingResponse
//	@Failure	401,403,500	{object}	model.ErrorResponse
//	@Router		/annotation/training [get]
func (h *Handler) GetTraining(c fiber.Ctx) error {
	claims, err := common.Claims(c, h.metrics)
	if err != nil {
		return common.Fail(h.log, h.metrics, err)
	}

	out, err := h.uc.Training(c.Context(), claims)
	if err != nil {
		return common.Fail(h.log, h.metrics, err)
	}

	return c.JSON(out)
}
