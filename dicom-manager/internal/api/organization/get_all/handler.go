package get_all

import (
	"context"

	"github.com/gofiber/fiber/v3"
	"github.com/rs/zerolog"
	"github.com/yogenyslav/ldt-2026/dicom-manager/internal/api/user/model"
	"github.com/yogenyslav/ldt-2026/dicom-manager/internal/usecases/organization/get_all"
	"github.com/yogenyslav/ldt-2026/dicom-manager/pkg/jwt"
	"github.com/yogenyslav/ldt-2026/dicom-manager/pkg/observability"
)

type usecase interface {
	GetAll(ctx context.Context) ([]get_all.Organization, error)
}

// Handler обрабатывает запрос списка организаций.
type Handler struct {
	log     *zerolog.Logger
	metrics observability.MetricsClient
	uc      usecase
}

// New создает новый экземпляр Handler.
func New(log *zerolog.Logger, metrics observability.MetricsClient, uc usecase) *Handler {
	return &Handler{log: log, metrics: metrics, uc: uc}
}

// GetAll возвращает список организаций администратору.
//
//	@Summary		Получить все организации.
//	@Description	Возвращает все организации, отсортированные по ID. Доступно только администратору.
//	@Tags			organization
//	@Produce		json
//	@Success		200	{object}	GetAllOut	"Список организаций."
//	@Failure		401	string		"Требуется авторизация."
//	@Failure		403	string		"Доступ запрещен."
//	@Failure		500	string		"Внутренняя ошибка сервера."
//	@Router			/organization [get]
func (h *Handler) GetAll(c fiber.Ctx) error {
	claims, ok := c.Locals("tokenClaims").(jwt.TokenClaims)
	if !ok || model.UserRole(claims.Role) != model.UserRoleAdmin {
		h.metrics.Counter("handler.get_all_organizations.forbidden").Inc()
		return fiber.NewError(fiber.StatusForbidden, "access denied")
	}

	organizations, err := h.uc.GetAll(c.Context())
	if err != nil {
		h.log.Error().Err(err).Msg("failed to get all organizations")
		return fiber.NewError(fiber.StatusInternalServerError, "failed to get all organizations")
	}

	out := GetAllOut{Organizations: make([]Organization, len(organizations))}
	for i, org := range organizations {
		out.Organizations[i] = Organization{ID: org.ID, Name: org.Name}
	}
	return c.Status(fiber.StatusOK).JSON(out)
}
