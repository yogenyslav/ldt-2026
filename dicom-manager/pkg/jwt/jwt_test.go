package jwt

import (
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/yogenyslav/loyalty/pkg/secure"
)

func TestNew(t *testing.T) {
	t.Parallel()

	cfg := &Config{
		Secret:     "secret",
		Encryption: "1D2A4F6G8H0J2L4N6P8R0T2V4X6Z8C0E2",
		Expire:     24,
	}
	provider := New(cfg)
	require.NotNil(t, provider)
	require.Equal(t, cfg, provider.cfg)
	require.Equal(t, []byte(cfg.Secret), provider.secretBytes)
}

func TestProvider_CreateAccessToken(t *testing.T) {
	t.Parallel()

	secret := "secret"
	encryptionKey := "1D2A4F6G8H0J2L4N6P8R0T2V4X6Z8C0E"

	tests := []struct {
		name    string
		userID  int64
		cfg     *Config
		wantErr bool
	}{
		{
			name:   "success, create access token without encryption",
			userID: 123,
			cfg: &Config{
				Secret: secret,
				Expire: 24,
			},
			wantErr: false,
		},
		{
			name:   "success, create access token with encryption",
			userID: 123,
			cfg: &Config{
				Secret:     secret,
				Encryption: encryptionKey,
				Expire:     24,
			},
			wantErr: false,
		},
		{
			name:   "fail, short encryption key",
			userID: 123,
			cfg: &Config{
				Secret:     secret,
				Encryption: "asdf",
				Expire:     24,
			},
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			provider := New(tt.cfg)
			token, err := provider.CreateAccessToken(tt.userID)
			if tt.wantErr {
				require.Error(t, err)
				require.Empty(t, token)
			} else {
				require.NoError(t, err)
				require.NotEmpty(t, token)

				if tt.cfg.Encryption != "" {
					decryptedToken, err := secure.Decrypt(token, encryptionKey)
					require.NoError(t, err)
					require.NotEmpty(t, decryptedToken)
				}
			}
		})
	}
}

func TestProvider_ParseAccessToken(t *testing.T) {
	t.Parallel()

	secret := "secret"
	encryptionKey := "1D2A4F6G8H0J2L4N6P8R0T2V4X6Z8C0E"

	tests := []struct {
		name        string
		userID      int64
		cfg         *Config
		modifyToken func(string) string
		wantUserID  int64
		wantErr     bool
	}{
		{
			name:   "success, parse access token without encryption",
			userID: 123,
			cfg: &Config{
				Secret: secret,
				Expire: 24,
			},
			wantUserID: 123,
			wantErr:    false,
		},
		{
			name:   "success, parse access token with encryption",
			userID: 123,
			cfg: &Config{
				Secret:     secret,
				Encryption: encryptionKey,
				Expire:     24,
			},
			wantUserID: 123,
			wantErr:    false,
		},
		{
			name:   "fail, invalid token format",
			userID: 123,
			cfg: &Config{
				Secret:     secret,
				Encryption: encryptionKey,
				Expire:     24,
			},
			modifyToken: func(token string) string {
				return token + "asdf"
			},
			wantErr: true,
		},
		{
			name:   "fail, invalid signature",
			userID: 123,
			cfg: &Config{
				Secret:     secret,
				Encryption: encryptionKey,
				Expire:     24,
			},
			modifyToken: func(token string) string {
				accessToken := jwt.NewWithClaims(jwt.SigningMethodNone, jwt.MapClaims{
					"exp": jwt.NewNumericDate(time.Now().Add(time.Hour * time.Duration(24))),
					"sub": 123,
				})
				signedToken, _ := accessToken.SignedString([]byte(secret))
				encryptedToken, _ := secure.Encrypt(signedToken, encryptionKey)
				return encryptedToken
			},
			wantErr: true,
		},
		{
			name:   "fail, expired token",
			userID: 123,
			cfg: &Config{
				Secret:     secret,
				Encryption: encryptionKey,
				Expire:     0,
			},
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			provider := New(tt.cfg)
			createdToken, err := provider.CreateAccessToken(tt.userID)
			require.NoError(t, err)
			require.NotEmpty(t, createdToken)

			tokenToParse := createdToken
			if tt.modifyToken != nil {
				tokenToParse = tt.modifyToken(createdToken)
			}

			parsedToken, err := provider.ParseAccessToken(tokenToParse)
			if tt.wantErr {
				require.Error(t, err)
				assert.Nil(t, parsedToken)
			} else {
				require.NoError(t, err)
				require.NotNil(t, parsedToken)

				claims, ok := parsedToken.Claims.(jwt.MapClaims)
				require.True(t, ok)

				sub, ok := claims["sub"].(float64)
				assert.True(t, ok)
				assert.Equal(t, float64(tt.wantUserID), sub)
			}
		})
	}
}
