package auth

import (
	"context"
	"errors"
	"fmt"

	jwtv5 "github.com/golang-jwt/jwt/v5"
	"github.com/jackc/pgx/v5"
	"github.com/rs/zerolog"
	storage "github.com/yogenyslav/ldt-2026/dicom-manager/internal/storage/user"
	"github.com/yogenyslav/ldt-2026/dicom-manager/pkg/jwt"
	"github.com/yogenyslav/ldt-2026/dicom-manager/pkg/observability"
	"github.com/yogenyslav/ldt-2026/dicom-manager/pkg/secure"
)

var (
	// ErrInvalidCredentials ошибка, возвращаемая при неверных учетных данных.
	ErrInvalidCredentials = errors.New("invalid credentials")
	// ErrUserNotFound ошибка, возвращаемая при отсутствии пользователя в БД.
	ErrUserNotFound = errors.New("user not found")
)

// userRepo интерфейс для работы с пользователями в БД.
type userRepo interface {
	FindByEmail(ctx context.Context, email string) (storage.User, error)
}

// JwtProvider провайдер для работы с JWT токенами.
type JwtProvider interface {
	CreateAccessToken(userID int64, role string, organizationID int64) (string, error)
	ParseAccessToken(accessTokenString string) (*jwtv5.Token, error)
}

// Usecase структура для реализации бизнес-логики аутентификации пользователя.
type Usecase struct {
	log      *zerolog.Logger
	metrics  observability.MetricsClient
	userRepo userRepo
	jwt      JwtProvider
}

// New создает новый экземпляр Usecase.
func New(l *zerolog.Logger, m observability.MetricsClient, storage userRepo, jwt JwtProvider) *Usecase {
	return &Usecase{
		log:      l,
		metrics:  m,
		userRepo: storage,
		jwt:      jwt,
	}
}

// Login реализует бизнес-логику аутентификации пользователя.
func (uc *Usecase) Login(ctx context.Context, in LoginRequest) (UserAuthData, error) {
	uc.metrics.Counter("usecase.login.total").Inc()

	user, err := uc.userRepo.FindByEmail(ctx, in.Email)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			uc.metrics.Counter("usecase.login.not_found").Inc()
			uc.log.Warn().Msg("user not found by email")
			return UserAuthData{}, fmt.Errorf("user not found by email: %w", ErrUserNotFound)
		}
		uc.metrics.Counter("usecase.login.error").Inc()
		uc.log.Error().Err(err).Msg("failed to find user by email")
		return UserAuthData{}, err
	}

	passwordMatch := secure.VerifyPassword(user.PasswordHash, in.RawPassword)
	if !passwordMatch {
		uc.metrics.Counter("usecase.login.invalid_credentials").Inc()
		uc.log.Warn().Msg("invalid credentials")
		return UserAuthData{}, fmt.Errorf("login failed: %w", ErrInvalidCredentials)
	}

	token, err := uc.jwt.CreateAccessToken(user.ID, user.Role, user.OrganizationID)
	if err != nil {
		uc.metrics.Counter("usecase.login.jwt_provider").Inc()
		uc.log.Error().Err(err).Msg("failed to create access token")
		return UserAuthData{}, err
	}

	uc.metrics.Counter("usecase.login.ok").Inc()
	return UserAuthData{
		Token:          token,
		Role:           Role(user.Role),
		UserID:         user.ID,
		OrganizationID: user.OrganizationID,
	}, nil
}

// ParseToken парсинг JWT токена и проверка его подписи.
func (uc *Usecase) ParseToken(_ context.Context, token string) (jwt.TokenClaims, error) {
	parsedToken, err := uc.jwt.ParseAccessToken(token)
	if err != nil {
		uc.metrics.Counter("usecase.parse_token.error").Inc()
		uc.log.Error().Err(err).Msg("failed to parse access token")
		return jwt.TokenClaims{}, err
	}

	if claims, ok := parsedToken.Claims.(jwtv5.MapClaims); ok && parsedToken.Valid {
		var tokenClaims jwt.TokenClaims

		if sub, ok := claims["sub"].(int64); ok {
			tokenClaims.UserID = sub
		}
		if role, ok := claims["role"].(string); ok {
			tokenClaims.Role = role
		}
		if organizationID, ok := claims["organization_id"].(float64); ok {
			tokenClaims.OrganizationID = int64(organizationID)
		}

		uc.metrics.Counter("usecase.parse_token.ok").Inc()
		return tokenClaims, nil
	}

	uc.metrics.Counter("usecase.parse_token.invalid").Inc()
	uc.log.Warn().Msg("invalid token claims")
	return jwt.TokenClaims{}, fmt.Errorf("invalid token claims")
}
