// Package jwt работает с JWT токенами, включая их генерацию и валидацию.
package jwt

import (
	"errors"
	"fmt"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/ilyakaznacheev/cleanenv"
	"github.com/yogenyslav/ldt-2026/dicom-manager/pkg/secure"
)

// TypeBearerToken константа, представляющая тип токена "Bearer".
const TypeBearerToken string = "Bearer"

var (
	// ErrJwtSignMethod ошибка, возникающая при неожиданном методе подписи JWT.
	ErrJwtSignMethod = errors.New("unexpected signing method")
)

// Config структура конфигурации для JWT провайдера.
type Config struct {
	Secret     string `yaml:"secret"     env:"JWT_SECRET"`
	Encryption string `yaml:"encryption" env:"JWT_ENCRYPTION"`
	Expire     int    `yaml:"expire"     env:"JWT_EXPIRE"     env-default:"1"` // in hours
}

// TokenClaims структура для хранения информации о пользователе в токене.
type TokenClaims struct {
	UserID         int64
	Role           string
	OrganizationID int64
}

// Provider провайдер для работы с JWT токенами, включая их генерацию и валидацию.
type Provider struct {
	cfg         Config
	secretBytes []byte
}

// New создает новый экземпляр JWT провайдера с заданной конфигурацией.
func New() (*Provider, error) {
	var cfg Config
	if err := cleanenv.ReadEnv(&cfg); err != nil {
		return nil, fmt.Errorf("read jwt config from env: %w", err)
	}
	return &Provider{
		cfg:         cfg,
		secretBytes: []byte(cfg.Secret),
	}, nil
}

// CreateAccessToken генерация JWT токена.
func (j *Provider) CreateAccessToken(userID int64, role string, organizationID int64) (string, error) {
	key := []byte(j.cfg.Secret)

	jwtClaims := jwt.MapClaims{
		"exp":             jwt.NewNumericDate(time.Now().Add(time.Hour * time.Duration(j.cfg.Expire))),
		"sub":             userID,
		"role":            role,
		"organization_id": organizationID,
	}

	accessToken := jwt.NewWithClaims(jwt.SigningMethodHS256, jwtClaims)
	signedToken, err := accessToken.SignedString(key)
	if err != nil {
		return "", fmt.Errorf("sign token: %v", err)
	}

	if j.cfg.Encryption != "" {
		return secure.Encrypt(signedToken, j.cfg.Encryption)
	}

	return signedToken, nil
}

// ParseAccessToken парсинг JWT токена и проверка его подписи.
func (j *Provider) ParseAccessToken(accessTokenString string) (*jwt.Token, error) {
	var err error

	if j.cfg.Encryption != "" {
		accessTokenString, err = secure.Decrypt(accessTokenString, j.cfg.Encryption)
		if err != nil {
			return nil, fmt.Errorf("decrypt token: %v", err)
		}
	}

	accessToken, err := jwt.Parse(
		accessTokenString, func(token *jwt.Token) (any, error) {
			if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
				return nil, fmt.Errorf("verify token signature: %v", ErrJwtSignMethod)
			}
			return j.secretBytes, nil
		},
	)
	if err != nil {
		return nil, fmt.Errorf("parse token: %v", err)
	}

	return accessToken, nil
}
