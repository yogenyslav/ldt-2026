package server

import (
	"github.com/gofiber/fiber/v3"
)

// errResponse структура ответа с ошибкой для API.
type errResponse struct {
	Message string `json:"message"`
}

// errorHandler обработчик ошибок для API.
func errorHandler(c fiber.Ctx, err error) error {
	if err == nil {
		return nil
	}

	if fiberErr, ok := err.(*fiber.Error); ok {
		return c.Status(fiberErr.Code).JSON(errResponse{Message: fiberErr.Message})
	}

	return c.Status(fiber.StatusInternalServerError).JSON(errResponse{Message: "Internal Server Error"})
}
