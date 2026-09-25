package secure

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestHashPassword(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name     string
		password string
		wantErr  bool
	}{
		{
			name:     "success, generate hashed password",
			password: "test123456",
			wantErr:  false,
		},
		{
			name:     "fail, password too long",
			password: string(make([]byte, 1000)),
			wantErr:  true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			hashedPassword, err := HashPassword(tt.password)
			if tt.wantErr {
				require.Error(t, err)
				assert.Empty(t, hashedPassword)
			} else {
				require.NoError(t, err)
				assert.NotEmpty(t, hashedPassword)
			}
		})
	}
}

func TestVerifyPassword(t *testing.T) {
	t.Parallel()

	password := "test123456"
	hashedPassword, err := HashPassword(password)
	require.NoError(t, err)

	tests := []struct {
		name           string
		hashedPassword string
		password       string
		want           bool
	}{
		{
			name:           "success, correct password",
			hashedPassword: hashedPassword,
			password:       password,
			want:           true,
		},
		{
			name:           "fail, incorrect password",
			hashedPassword: hashedPassword,
			password:       "wrongpassword",
			want:           false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			got := VerifyPassword(tt.hashedPassword, tt.password)
			assert.Equal(t, tt.want, got)
		})
	}
}

func TestEncrypt(t *testing.T) {
	t.Parallel()

	key := "1D5494663CE91BAC866DD760C52C848A"

	tests := []struct {
		name      string
		plainText string
		keyRaw    string
		wantErr   bool
	}{
		{
			name:      "success, encrypt plain text",
			plainText: "test",
			keyRaw:    key,
			wantErr:   false,
		},
		{
			name:      "fail, invalid key length",
			plainText: "test",
			keyRaw:    "asdf",
			wantErr:   true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			encryptedText, err := Encrypt(tt.plainText, tt.keyRaw)
			if tt.wantErr {
				require.Error(t, err)
				assert.Empty(t, encryptedText)
			} else {
				require.NoError(t, err)
				assert.NotEmpty(t, encryptedText)
			}
		})
	}
}

func TestDecrypt(t *testing.T) {
	t.Parallel()

	key := "1D5494663CE91BAC866DD760C52C848A"

	plainText := "test"
	encryptedText, err := Encrypt(plainText, key)
	require.NoError(t, err)

	tests := []struct {
		name          string
		encryptedText string
		keyRaw        string
		want          string
		wantErr       bool
	}{
		{
			name:          "success, decrypt encrypted text",
			encryptedText: encryptedText,
			keyRaw:        key,
			want:          plainText,
			wantErr:       false,
		},
		{
			name:          "fail, invalid key length",
			encryptedText: encryptedText,
			keyRaw:        "asdf",
			want:          "",
			wantErr:       true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			got, err := Decrypt(tt.encryptedText, tt.keyRaw)
			if tt.wantErr {
				require.Error(t, err)
				assert.Empty(t, got)
			} else {
				require.NoError(t, err)
				assert.Equal(t, tt.want, got)
			}
		})
	}
}
