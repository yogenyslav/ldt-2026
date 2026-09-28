package auth

import (
	"context"
	"testing"

	"github.com/rs/zerolog"
	"github.com/yogenyslav/ldt-2026/dicom-manager/pkg/jwt"
	"github.com/yogenyslav/ldt-2026/dicom-manager/pkg/observability/metrics"
)

func TestIssuedTokenPreservesIdentity(t *testing.T) {
	t.Setenv("JWT_SECRET", "test-secret")
	t.Setenv("JWT_ENCRYPTION", "")
	t.Setenv("JWT_EXPIRE", "1")
	provider, err := jwt.New()
	if err != nil {
		t.Fatal(err)
	}
	token, err := provider.CreateAccessToken(42, "specialist", 218)
	if err != nil {
		t.Fatal(err)
	}
	m, err := metrics.New("auth_test")
	if err != nil {
		t.Fatal(err)
	}
	log := zerolog.Nop()
	uc := New(&log, m, nil, provider)
	claims, err := uc.ParseToken(context.Background(), token)
	if err != nil {
		t.Fatal(err)
	}
	if claims.UserID != 42 || claims.OrganizationID != 218 || claims.Role != "specialist" {
		t.Fatalf("identity lost: %+v", claims)
	}
}
