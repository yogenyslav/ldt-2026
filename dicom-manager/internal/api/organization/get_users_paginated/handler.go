package get_users_paginated

import (
	"context"
	"strconv"

	"github.com/gofiber/fiber/v3"
	"github.com/rs/zerolog"
	"github.com/yogenyslav/ldt-2026/dicom-manager/internal/api/user/model"
	"github.com/yogenyslav/ldt-2026/dicom-manager/internal/usecases/organization/get_users"
	"github.com/yogenyslav/ldt-2026/dicom-manager/pkg/jwt"
	"github.com/yogenyslav/ldt-2026/dicom-manager/pkg/observability"
)

type usecase interface {
	GetUsers(ctx context.Context, request get_users.GetUsersRequest) ([]get_users.User, error)
}

// Handler структура обработчика запроса получения пользователей с пагинацией.
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

// GetUsersPaginated обработчик для получения пользователей организации с пагинацией.
//
//	@Summary		Получить пользователей с пагинацией.
//	@Description	Получить пользователей организации с пагинацией.
//	@Tags			organization
//	@Accept			json
//	@Produce		json
//	@Param			org_id	path		string					true	"ID организации"
//	@Param			offset	query		int						false	"Offset для пагинации (по умолчанию 0)"
//	@Param			limit	query		int						false	"Limit для пагинации (по умолчанию 10)"
//	@Success		200		{object}	GetUsersPaginatedOut	"Пользователи успешно получены."
//	@Failure		400		string		"Некорректный запрос."
//	@Failure		403		string		"Доступ запрещен."
//	@Failure		404		string		"Организация не найдена."
//	@Failure		500		string		"Внутренняя ошибка сервера."
//	@Router			/organization/{org_id}/users [get]
func (h *Handler) GetUsersPaginated(c fiber.Ctx) error {
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

	if err = h.checkPermission(c, organizationID); err != nil {
		return err
	}

	offset := fiber.Query[uint64](c, "offset", 0)
	limit := fiber.Query[uint64](c, "limit", 10)

	getUsersReq := get_users.GetUsersRequest{
		OrganizationID: organizationID,
		Offset:         offset,
		Limit:          limit,
	}
	users, err := h.uc.GetUsers(c.Context(), getUsersReq)
	if err != nil {
		h.log.Error().Err(err).Msg("failed to get users")
		return fiber.NewError(fiber.StatusInternalServerError, "failed to get users")
	}

	out := convertToOut(users)
	return c.Status(fiber.StatusOK).JSON(out)
}

func (h *Handler) checkPermission(c fiber.Ctx, organizationID int64) error {
	tokenClaims := c.Locals("tokenClaims")
	if tokenClaims == nil {
		h.metrics.Counter("handler.get_users_paginated.missing_token_claims").Inc()
		h.log.Error().Msg("missing token claims in context")
		return fiber.NewError(fiber.StatusForbidden, "access denied")
	}

	claims, ok := tokenClaims.(jwt.TokenClaims)
	if !ok {
		h.metrics.Counter("handler.get_users_paginated.invalid_token_claims").Inc()
		h.log.Error().Msg("invalid token claims type")
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

func convertToOut(users []get_users.User) GetUsersPaginatedOut {
	outUsers := make([]OrganizationUser, len(users))
	for i, user := range users {
		outUsers[i] = OrganizationUser{
			ID:       user.ID,
			FullName: user.FullName,
		}
	}
	return GetUsersPaginatedOut{
		Users: outUsers,
	}
}
