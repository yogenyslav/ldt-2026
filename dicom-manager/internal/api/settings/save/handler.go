package save

import (
	"context"
	"encoding/json"

	"github.com/gofiber/fiber/v3"
	"github.com/rs/zerolog"
	"github.com/yogenyslav/ldt-2026/dicom-manager/internal/api/settings/common"
	_ "github.com/yogenyslav/ldt-2026/dicom-manager/internal/api/settings/model"
	"github.com/yogenyslav/ldt-2026/dicom-manager/pkg/observability"
)

type usecase interface {
	Save(ctx context.Context, organizationID int64, settings map[string]float64) (map[string]float64, error)
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

// Save обрабатывает параметры анализа организации.
//
//	@Summary		Сохранить параметры ротации для новых задач (администратор)
//	@Description	Сумма процентов не больше 100; центр × (1 + сумма / 100) не больше 8 мм. Готовые результаты не пересчитываются.
//	@Tags			settings
//	@Accept			json
//	@Produce		json
//	@Param			settings		body		model.RotationSettings	true	"Параметры ротации"
//	@Success		200				{object}	model.RotationSettings
//	@Failure		400,401,403,500	{object}	map[string]string
//	@Router			/settings [put]
func (h *Handler) Save(c fiber.Ctx) error {
	h.metrics.Counter("handler.settings.save.total").Inc()

	claims, err := common.Claims(c)
	if err != nil {
		return common.Fail(h.log, h.metrics, err)
	}

	var raw map[string]json.RawMessage
	if err = json.Unmarshal(c.Body(), &raw); err != nil {
		return common.Fail(h.log, h.metrics, fiber.ErrBadRequest)
	}

	settings := make(map[string]float64, len(raw))
	for key, value := range raw {
		var number *float64
		if err = json.Unmarshal(value, &number); err != nil || number == nil {
			return common.Fail(h.log, h.metrics, fiber.ErrBadRequest)
		}

		settings[key] = *number
	}

	out, err := h.uc.Save(c.Context(), claims.OrganizationID, settings)
	if err != nil {
		return common.Fail(h.log, h.metrics, err)
	}

	h.metrics.Counter("handler.settings.save.ok").Inc()
	return c.JSON(out)
}
