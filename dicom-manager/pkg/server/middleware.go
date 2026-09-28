package server

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/yogenyslav/ldt-2026/dicom-manager/pkg/jwt"
	"github.com/yogenyslav/ldt-2026/dicom-manager/pkg/observability"
)

type jwtParserFn func(ctx context.Context, token string) (jwt.TokenClaims, error)

// AuthMiddleware миддлварь для аутентификации пользователей.
func AuthMiddleware(fn jwtParserFn) fiber.Handler {
	return func(c fiber.Ctx) error {
		tokenHeader := c.Get("Authorization")
		if tokenHeader == "" {
			return fiber.NewError(fiber.StatusUnauthorized, "authorization header is missing")
		}

		tokenParts := strings.Split(tokenHeader, " ")
		if len(tokenParts) != 2 || tokenParts[0] != jwt.TypeBearerToken {
			return fiber.NewError(fiber.StatusUnauthorized, "invalid Authorization header format")
		}

		tokenClaims, err := fn(c.Context(), tokenParts[1])
		if err != nil {
			return fiber.NewError(fiber.StatusUnauthorized, "invalid or expired token")
		}

		c.Locals("tokenClaims", tokenClaims)
		return c.Next()
	}
}

// MetricsMiddleware миддлварь для сбора метрик HTTP-запросов.
func MetricsMiddleware(metrics observability.MetricsClient) fiber.Handler {
	return func(c fiber.Ctx) error {
		start := time.Now()
		err := c.Next()
		duration := time.Since(start).Seconds()

		path := "unmatched"
		if c.Matched() && !c.IsMiddleware() {
			path = c.Route().Path
		}

		methodMetricPrefix := fmt.Sprintf("http.requests.%s_%s.", c.Method(), path)
		metrics.Counter(methodMetricPrefix + "total").Inc()
		metrics.Gauge(methodMetricPrefix + "response_time").Set(duration)

		if err != nil {
			metrics.Counter(methodMetricPrefix + "error").Inc()
			return err
		}

		metrics.Counter(methodMetricPrefix + "ok").Inc()
		return nil
	}
}
