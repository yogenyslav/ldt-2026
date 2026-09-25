package user_info_get_by_id

import (
	"github.com/gofiber/fiber/v3"
	"github.com/rs/zerolog"
	"github.com/yogenyslav/ldt-2026/dicom-manager/pkg/observability"
)

// Handler обработчик для получения информации о пользователе.
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

// UserGetInfo обработчик для получения информации о пользователе.
//
//	@Summary		Получить информацию о пользователе.
//	@Description	Получить информацию о пользователе по его ID.
//	@Tags			user
//	@Accept			json
//	@Produce		json
//	@Param			user_id	path		string			true	"ID пользователя"
//	@Success		200		{object}	UserGetInfoOut	"Информация о пользователе успешно получена."
//	@Failure		400		string		"Некорректный запрос."
//	@Failure		403		string		"Доступ запрещен."
//	@Failure		404		string		"Пользователь не найден."
//	@Failure		500		string		"Внутренняя ошибка сервера."
//	@Router			/user/{user_id} [get]
func (h *Handler) UserGetInfo(c fiber.Ctx) error {
	return c.SendStatus(fiber.StatusNotImplemented)
}
