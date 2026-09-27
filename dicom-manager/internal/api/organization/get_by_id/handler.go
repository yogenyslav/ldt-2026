package get_by_id

import (
	"context"
	"errors"
	"strconv"

	"github.com/gofiber/fiber/v3"
	"github.com/rs/zerolog"
	"github.com/yogenyslav/ldt-2026/dicom-manager/internal/api/user/model"
	"github.com/yogenyslav/ldt-2026/dicom-manager/internal/usecases/organization/get_by_id"
	"github.com/yogenyslav/ldt-2026/dicom-manager/pkg/jwt"
	"github.com/yogenyslav/ldt-2026/dicom-manager/pkg/observability"
)

type usecase interface {
	GetByID(ctx context.Context, organizationID int64) (get_by_id.Organization, error)
}

// Handler структура обработчика запроса организации по ID.
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

// GetByID обработчик для получения организации по ID.
//
//	@Summary		Получить организацию по ID.
//	@Description	Получить организацию по ID.
//	@Tags			organization
//	@Accept			json
//	@Produce		json
//	@Param			org_id	path		string		true	"ID организации"
//	@Success		200		{object}	GetByIDOut	"Организация успешно получена."
//	@Failure		400		string		"Некорректный запрос."
//	@Failure		403		string		"Доступ запрещен."
//	@Failure		404		string		"Организация не найдена."
//	@Failure		500		string		"Внутренняя ошибка сервера."
//	@Router			/organization/{org_id} [get]
func (h *Handler) GetByID(c fiber.Ctx) error {
	organizationIDRaw := c.Params("org_id")
	if organizationIDRaw == "" {
		h.log.Warn().Msg("org_id is empty")
		return fiber.NewError(fiber.StatusBadRequest, "org_id is required")
	}

	organizationID, err := strconv.ParseInt(organizationIDRaw, 10, 64)
	if err != nil {
		h.log.Warn().Err(err).Msg("invalid org_id format")
		return fiber.NewError(fiber.StatusBadRequest, "invalid org_id format")
	}

	org, err := h.uc.GetByID(c.Context(), organizationID)
	if err != nil {
		if errors.Is(err, get_by_id.ErrOrganizationNotFound) {
			h.log.Warn().Msg("organization not found by ID")
			return fiber.NewError(fiber.StatusNotFound, "organization not found by ID")
		}
		h.log.Error().Err(err).Msg("failed to get organization by ID")
		return fiber.NewError(fiber.StatusInternalServerError, "failed to get organization by ID")
	}

	out := convertOut(org)
	return c.Status(fiber.StatusOK).JSON(out)
}

func (h *Handler) checkPermission(c fiber.Ctx, organizationID int64) error {
	tokenClaims := c.Locals("tokenClaims")
	if tokenClaims == nil {
		h.metrics.Counter("handler.get_organization_by_id.missing_token_claims").Inc()
		h.log.Error().Msg("tokenClaims is nil")
		return fiber.NewError(fiber.StatusForbidden, "access denied")
	}

	claims, ok := tokenClaims.(jwt.TokenClaims)
	if !ok {
		h.metrics.Counter("handler.get_organization_by_id.invalid_token_claims").Inc()
		h.log.Error().Msg("invalid tokenClaims format")
		return fiber.NewError(fiber.StatusForbidden, "access denied")
	}

	if model.UserRole(claims.Role) == model.UserRoleAdmin {
		return nil
	}

	if claims.OrganizationID == organizationID {
		return nil
	}

	return fiber.NewError(fiber.StatusForbidden, "access denied")
}

func convertOut(organization get_by_id.Organization) GetByIDOut {
	return GetByIDOut{
		ID:   organization.ID,
		Name: organization.Name,
	}
}
