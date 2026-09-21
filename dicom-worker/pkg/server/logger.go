package server

import (
	"context"

	"github.com/grpc-ecosystem/go-grpc-middleware/v2/interceptors/logging"
	"github.com/rs/zerolog"
)

// LoggerInterceptor возвращает функцию логирования для gRPC сервера.
func LoggerInterceptor(baseLogger *zerolog.Logger) logging.LoggerFunc {
	return func(_ context.Context, level logging.Level, msg string, fields ...any) {
		l := baseLogger
		if len(fields) > 0 {
			l = new(baseLogger.With().Fields(fields).Logger())
		}

		switch level {
		case logging.LevelInfo:
			l.Info().Msg(msg)
		case logging.LevelError:
			l.Error().Msg(msg)
		case logging.LevelDebug:
			l.Debug().Msg(msg)
		case logging.LevelWarn:
			l.Warn().Msg(msg)
		default:
			l.Info().Msg(msg)
		}
	}
}
