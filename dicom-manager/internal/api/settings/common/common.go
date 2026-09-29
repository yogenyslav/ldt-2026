package common

import (
	"errors"

	"github.com/gofiber/fiber/v3"
	"github.com/rs/zerolog"
	"github.com/yogenyslav/ldt-2026/dicom-manager/internal/usecases/settings/save"
	"github.com/yogenyslav/ldt-2026/dicom-manager/pkg/jwt"
	"github.com/yogenyslav/ldt-2026/dicom-manager/pkg/observability"
)

// Claims проверяет авторизацию и права администратора организации.
func Claims(c fiber.Ctx) (jwt.TokenClaims, error) {
	claims, ok := c.Locals("tokenClaims").(jwt.TokenClaims)
	if !ok {
		return claims, fiber.ErrUnauthorized
	}

	if claims.Role != "admin" || claims.OrganizationID <= 0 || claims.UserID <= 0 {
		return claims, fiber.ErrForbidden
	}

	return claims, nil
}

// Fail записывает ошибку и преобразует ее в ответ API.
func Fail(log *zerolog.Logger, metrics observability.MetricsClient, err error) error {
	metrics.Counter("handler.settings.error").Inc()

	var fiberErr *fiber.Error
	if errors.As(err, &fiberErr) {
		return fiberErr
	}

	if errors.Is(err, save.ErrInvalid) {
		return fiber.NewError(fiber.StatusBadRequest, err.Error())
	}

	log.Error().Err(err).Msg("analysis settings operation failed")
	return fiber.ErrInternalServerError
}
