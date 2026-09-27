package get_by_id

import (
	"context"
	"errors"
	"strconv"

	"github.com/gofiber/fiber/v3"
	"github.com/rs/zerolog"
	"github.com/yogenyslav/ldt-2026/dicom-manager/internal/api/user/model"
	user_get_by_id "github.com/yogenyslav/ldt-2026/dicom-manager/internal/usecases/user/get_by_id"
	"github.com/yogenyslav/ldt-2026/dicom-manager/pkg/jwt"
	"github.com/yogenyslav/ldt-2026/dicom-manager/pkg/observability"
)

type usecase interface {
	GetByID(ctx context.Context, id int64) (user_get_by_id.User, error)
}

// Handler обработчик для получения информации о пользователе.
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

// GetByID обработчик для получения информации о пользователе.
//
//	@Summary		Получить информацию о пользователе.
//	@Description	Получить информацию о пользователе по его ID.
//	@Tags			user
//	@Accept			json
//	@Produce		json
//	@Param			user_id	path		string		true	"ID пользователя"
//	@Success		200		{object}	GetByIDOut	"Информация о пользователе успешно получена."
//	@Failure		400		string		"Некорректный запрос."
//	@Failure		403		string		"Доступ запрещен."
//	@Failure		404		string		"Пользователь не найден."
//	@Failure		500		string		"Внутренняя ошибка сервера."
//	@Router			/user/{user_id} [get]
func (h *Handler) GetByID(c fiber.Ctx) error {
	userIDRaw := c.Params("user_id")
	if userIDRaw == "" {
		h.log.Warn().Msg("user_id is empty")
		return fiber.NewError(fiber.StatusBadRequest, "user_id is required")
	}

	userID, err := strconv.ParseInt(userIDRaw, 10, 64)
	if err != nil {
		h.log.Warn().Err(err).Msg("invalid user_id format")
		return fiber.NewError(fiber.StatusBadRequest, "invalid user_id format")
	}

	if err := h.checkPermission(c, userID); err != nil {
		return err
	}

	user, err := h.uc.GetByID(c.Context(), userID)
	if err != nil {
		if errors.Is(err, user_get_by_id.ErrUserNotFound) {
			h.log.Warn().Err(err).Msg("user not found")
			return fiber.NewError(fiber.StatusNotFound, "user not found")
		}
		h.log.Error().Err(err).Msg("failed to get user info by id")
		return fiber.NewError(fiber.StatusInternalServerError, "failed to get user info")
	}

	out := convertToOut(user)
	return c.Status(fiber.StatusOK).JSON(out)
}

func (h *Handler) checkPermission(c fiber.Ctx, userID int64) error {
	tokenClaims := c.Locals("tokenClaims")
	if tokenClaims == nil {
		h.metrics.Counter("handler.get_user_by_id.missing_token_claims").Inc()
		h.log.Error().Msg("tokenClaims is nil")
		return fiber.NewError(fiber.StatusForbidden, "access denied")
	}

	claims, ok := tokenClaims.(jwt.TokenClaims)
	if !ok {
		h.metrics.Counter("handler.get_user_by_id.invalid_token_claims").Inc()
		h.log.Error().Msg("invalid tokenClaims format")
		return fiber.NewError(fiber.StatusForbidden, "access denied")
	}

	if model.UserRole(claims.Role) == model.UserRoleAdmin {
		return nil
	}

	if claims.UserID != userID {
		h.log.Warn().Msg("access denied: user trying to access another user's info")
		return fiber.NewError(fiber.StatusForbidden, "access denied")
	}

	return nil
}

func convertToOut(user user_get_by_id.User) GetByIDOut {
	return GetByIDOut{
		ID:             user.ID,
		FullName:       user.FullName,
		Role:           model.UserRole(user.Role),
		OrganizationID: user.OrganizationID,
	}
}
