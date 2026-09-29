package common

import (
	"errors"

	"github.com/gofiber/fiber/v3"
	"github.com/rs/zerolog"
	"github.com/yogenyslav/ldt-2026/dicom-manager/internal/usecases/annotation"
	"github.com/yogenyslav/ldt-2026/dicom-manager/pkg/jwt"
	"github.com/yogenyslav/ldt-2026/dicom-manager/pkg/observability"
)

// Claims проверяет авторизацию и права администратора.
func Claims(c fiber.Ctx, metrics observability.MetricsClient) (jwt.TokenClaims, error) {
	metrics.Counter("handler.annotation.total").Inc()
	claims, ok := c.Locals("tokenClaims").(jwt.TokenClaims)
	if !ok {
		return claims, fiber.NewError(fiber.StatusUnauthorized, "Требуется авторизация")
	}

	if claims.Role != "admin" {
		return claims, annotation.ErrForbidden
	}

	return claims, nil
}

// Fail записывает ошибку в логи и метрики и преобразует её в ответ API.
func Fail(log *zerolog.Logger, metrics observability.MetricsClient, err error) error {
	metrics.Counter("handler.annotation.error").Inc()

	var fiberErr *fiber.Error
	if errors.As(err, &fiberErr) {
		log.Warn().Err(err).Msg("Некорректный запрос разметки")
		return fiberErr
	}

	status := fiber.StatusInternalServerError
	switch {
	case errors.Is(err, annotation.ErrInvalid):
		status = fiber.StatusBadRequest
	case errors.Is(err, annotation.ErrForbidden):
		status = fiber.StatusForbidden
	case errors.Is(err, annotation.ErrJobNotFound), errors.Is(err, annotation.ErrVersionNotFound):
		status = fiber.StatusNotFound
	case errors.Is(err, annotation.ErrSuperseded), errors.Is(err, annotation.ErrIDConflict), errors.Is(err, annotation.ErrTrainingUnavailable):
		status = fiber.StatusConflict
	case errors.Is(err, annotation.ErrCoordinates):
		status = fiber.StatusUnprocessableEntity
	}

	if status == fiber.StatusInternalServerError {
		log.Error().Err(err).Msg("Ошибка обработки разметки")
		return fiber.NewError(status, "Не удалось обработать разметку")
	}

	log.Warn().Err(err).Msg("Запрос разметки отклонён")
	return fiber.NewError(status, err.Error())
}
