package get

import (
	"context"

	"github.com/gofiber/fiber/v3"
	"github.com/rs/zerolog"
	"github.com/yogenyslav/ldt-2026/dicom-manager/internal/api/settings/common"
	_ "github.com/yogenyslav/ldt-2026/dicom-manager/internal/api/settings/model"
	"github.com/yogenyslav/ldt-2026/dicom-manager/pkg/observability"
)

type usecase interface {
	Get(ctx context.Context, organizationID int64) (map[string]float64, error)
}

// Handler обрабатывает запросы к параметрам анализа организации.
type Handler struct {
	log     *zerolog.Logger
	metrics observability.MetricsClient
	uc      usecase
}

// New создает новый экземпляр Handler.
func New(log *zerolog.Logger, metrics observability.MetricsClient, uc usecase) *Handler {
	return &Handler{
		log:     log,
		metrics: metrics,
		uc:      uc,
	}
}

// Get обрабатывает параметры анализа организации.
//
//	@Summary	Параметры ротации организации (администратор)
//	@Tags		settings
//	@Produce	json
//	@Success	200			{object}	model.RotationSettings
//	@Failure	401,403,500	{object}	map[string]string
//	@Router		/settings [get]
func (h *Handler) Get(c fiber.Ctx) error {
	h.metrics.Counter("handler.settings.get.total").Inc()

	claims, err := common.Claims(c)
	if err != nil {
		return common.Fail(h.log, h.metrics, err)
	}

	out, err := h.uc.Get(c.Context(), claims.OrganizationID)
	if err != nil {
		return common.Fail(h.log, h.metrics, err)
	}

	h.metrics.Counter("handler.settings.get.ok").Inc()
	return c.JSON(out)
}
