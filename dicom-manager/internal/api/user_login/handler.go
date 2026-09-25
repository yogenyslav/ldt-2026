package user_login

import (
	"github.com/gofiber/fiber/v3"
	"github.com/rs/zerolog"
	"github.com/yogenyslav/ldt-2026/dicom-manager/pkg/observability"
)

// Handler обработчик для аутентификации пользователя.
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

// UserLogin обработчик для аутентификации пользователя.
//
//	@Summary		Аутентификация пользователя.
//	@Description	Аутентификация пользователя по его логину и паролю.
//	@Tags			user
//	@Accept			json
//	@Produce		json
//	@Param			UserLoginIn	body		UserLoginIn		true	"Данные для аутентификации пользователя"
//	@Success		200			{object}	UserLoginOut	"Пользователь успешно аутентифицирован."
//	@Failure		400			string		"Некорректный запрос."
//	@Failure		401			string		"Неверный логин или пароль."
//	@Failure		500			string		"Внутренняя ошибка сервера."
//	@Router			/user/login [post]
func (h *Handler) UserLogin(c fiber.Ctx) error {
	return c.SendStatus(fiber.StatusNotImplemented)
}
