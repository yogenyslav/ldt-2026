// Package secure предоставляет функции для хеширования и шифрования.
package secure

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"fmt"
	"io"

	"golang.org/x/crypto/bcrypt"
)

var (
	// ErrCipherTooShort ошибка, возникающая, если длина ключа шифрования меньше 32 байт.
	ErrCipherTooShort = errors.New("cipher too short, must use 32-bit")
)

// HashPassword хеширует пароль с использованием bcrypt и возвращает хешированную версию.
func HashPassword(password string) (string, error) {
	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return "", fmt.Errorf("bcrypt: %w", err)
	}
	return string(hashedPassword), nil
}

// VerifyPassword сравнивает хешированный пароль с предоставленным паролем и возвращает true, если они совпадают.
func VerifyPassword(hashedPassword, password string) bool {
	return bcrypt.CompareHashAndPassword([]byte(hashedPassword), []byte(password)) == nil
}

// Encrypt шифрует строку с помощью ключа.
func Encrypt(plainText, keyRaw string) (string, error) {
	key := []byte(keyRaw)

	block, err := aes.NewCipher(key)
	if err != nil {
		return "", fmt.Errorf("failed to create cipher: %w", err)
	}

	aesGCM, err := cipher.NewGCM(block)
	if err != nil {
		return "", fmt.Errorf("failed to create GCM: %w", err)
	}

	// generate a random nonce
	nonce := make([]byte, aesGCM.NonceSize())
	if _, err = io.ReadFull(rand.Reader, nonce); err != nil {
		return "", fmt.Errorf("failed to generate nonce: %w", err)
	}

	// encrypt and authenticate the plaintext
	// the nonce is prepended to the cipherText
	cipherText := aesGCM.Seal(nonce, nonce, []byte(plainText), nil)

	return base64.StdEncoding.EncodeToString(cipherText), nil
}

// Decrypt расшифровывает строку с помощью ключа.
func Decrypt(encryptedText, keyRaw string) (string, error) {
	key := []byte(keyRaw)

	cipherText, err := base64.StdEncoding.DecodeString(encryptedText)
	if err != nil {
		return "", fmt.Errorf("failed to decode ciphertext: %w", err)
	}

	block, err := aes.NewCipher(key)
	if err != nil {
		return "", fmt.Errorf("failed to create cipher: %w", err)
	}

	aesGCM, err := cipher.NewGCM(block)
	if err != nil {
		return "", fmt.Errorf("failed to create GCM: %w", err)
	}

	nonceSize := aesGCM.NonceSize()

	// ensure the ciphertext is large enough to contain a nonce
	if len(cipherText) < nonceSize {
		return "", fmt.Errorf("key for nonce: %w", ErrCipherTooShort)
	}

	// extract nonce from the beginning of the ciphertext
	nonce, cipherText := cipherText[:nonceSize], cipherText[nonceSize:]

	plainText, err := aesGCM.Open(nil, nonce, cipherText, nil)
	if err != nil {
		return "", fmt.Errorf("failed to decrypt: %w", err)
	}

	return string(plainText), nil
}
