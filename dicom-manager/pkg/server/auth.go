package server

import (
	"context"

	jwtwire "github.com/golang-jwt/jwt/v5"
	"github.com/grpc-ecosystem/go-grpc-middleware/v2/interceptors/auth"
	"github.com/yogenyslav/ldt-2026/dicom-manager/pkg/jwt"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

// AuthInterceptor возвращает функцию аутентификации для gRPC сервера,
// которая проверяет JWT токен в заголовке запроса и извлекает имя пользователя из него.
func AuthInterceptor(jwtProvider *jwt.Provider) auth.AuthFunc {
	return func(ctx context.Context) (context.Context, error) {
		tokenRaw, err := auth.AuthFromMD(ctx, jwt.TypeBearerToken)
		if err != nil {
			return nil, status.Error(codes.Unauthenticated, err.Error())
		}

		token, err := jwtProvider.ParseAccessToken(tokenRaw)
		if err != nil {
			return nil, status.Error(codes.Unauthenticated, err.Error())
		}

		userID, ok := token.Claims.(jwtwire.MapClaims)["sub"].(float64)
		if !ok {
			return nil, status.Error(codes.Unauthenticated, "invalid token claims")
		}

		return context.WithValue(ctx, "userID", int64(userID)), nil
	}
}
