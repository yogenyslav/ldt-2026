package login

import (
	"context"
	"errors"

	"github.com/gofiber/fiber/v3"
	"github.com/rs/zerolog"
	"github.com/yogenyslav/ldt-2026/dicom-manager/internal/api/user/model"
	"github.com/yogenyslav/ldt-2026/dicom-manager/internal/usecases/user/auth"
	"github.com/yogenyslav/ldt-2026/dicom-manager/pkg/observability"
)

type usecase interface {
	Login(ctx context.Context, in auth.LoginRequest) (auth.UserAuthData, error)
}

// Handler обработчик для аутентификации пользователя.
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

// Login обработчик для аутентификации пользователя.
//
//	@Summary		Аутентификация пользователя.
//	@Description	Аутентификация пользователя по его логину и паролю.
//	@Tags			user
//	@Accept			json
//	@Produce		json
//	@Param			UserLoginIn	body		LoginIn		true	"Данные для аутентификации пользователя"
//	@Success		200			{object}	LoginOut	"Пользователь успешно аутентифицирован."
//	@Failure		400			string		"Некорректный запрос."
//	@Failure		401			string		"Неверный логин или пароль."
//	@Failure		500			string		"Внутренняя ошибка сервера."
//	@Router			/user/login [post]
func (h *Handler) Login(c fiber.Ctx) error {
	var in LoginIn
	if err := c.Bind().JSON(&in); err != nil {
		h.log.Warn().Err(err).Msg("failed to bind request")
		return fiber.NewError(fiber.StatusBadRequest, "invalid request body")
	}

	if err := validateIn(in); err != nil {
		h.log.Warn().Err(err).Msg("invalid request body")
		return err
	}

	loginReq := auth.LoginRequest{
		Email:       in.Email,
		RawPassword: in.Password,
	}
	userAuthData, err := h.uc.Login(c.Context(), loginReq)
	if err != nil {
		if errors.Is(err, auth.ErrUserNotFound) || errors.Is(err, auth.ErrInvalidCredentials) {
			h.log.Warn().Err(err).Msg("user not found")
			h.metrics.Counter("handler.login.user_not_found").Inc()
			return fiber.NewError(fiber.StatusUnauthorized, "invalid credentials")
		}
		h.log.Error().Err(err).Msg("failed to login user")
		h.metrics.Counter("handler.login.error").Inc()
		return fiber.NewError(fiber.StatusInternalServerError, "internal server error")
	}

	out := convertToOut(userAuthData)
	return c.Status(fiber.StatusOK).JSON(out)
}

func validateIn(in LoginIn) error {
	if in.Email == "" {
		return fiber.NewError(fiber.StatusBadRequest, "email is required")
	}
	if in.Password == "" {
		return fiber.NewError(fiber.StatusBadRequest, "password is required")
	}
	return nil
}

func convertToOut(user auth.UserAuthData) LoginOut {
	return LoginOut{
		Token:          user.Token,
		Role:           model.UserRole(user.Role),
		UserID:         user.UserID,
		OrganizationID: user.OrganizationID,
	}
}
