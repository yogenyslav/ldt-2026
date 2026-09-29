package get_all

import (
	"context"
	"errors"
	"io"
	"net/http/httptest"
	"testing"

	"github.com/gofiber/fiber/v3"
	"github.com/rs/zerolog"
	uc "github.com/yogenyslav/ldt-2026/dicom-manager/internal/usecases/organization/get_all"
	"github.com/yogenyslav/ldt-2026/dicom-manager/pkg/jwt"
	"github.com/yogenyslav/ldt-2026/dicom-manager/pkg/observability/metrics"
	"github.com/yogenyslav/ldt-2026/dicom-manager/pkg/server"
)

type usecaseStub struct {
	organizations []uc.Organization
	err           error
	called        bool
}

func (s *usecaseStub) GetAll(context.Context) ([]uc.Organization, error) {
	s.called = true
	return s.organizations, s.err
}

func TestGetAll(t *testing.T) {
	for _, tc := range []struct {
		name          string
		token         string
		organizations []uc.Organization
		err           error
		status        int
		body          string
		called        bool
	}{
		{name: "admin", token: "admin", organizations: []uc.Organization{{ID: 1, Name: "First"}, {ID: 2, Name: "Second"}}, status: 200, body: `{"organizations":[{"id":1,"name":"First"},{"id":2,"name":"Second"}]}`, called: true},
		{name: "empty", token: "admin", status: 200, body: `{"organizations":[]}`, called: true},
		{name: "specialist", token: "specialist", status: 403},
		{name: "unknown role", token: "unknown", status: 403},
		{name: "unauthenticated", status: 401},
		{name: "invalid token", token: "invalid", status: 401},
		{name: "storage error", token: "admin", err: errors.New("database unavailable"), status: 500, called: true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			log := zerolog.Nop()
			m, err := metrics.New("organization_test")
			if err != nil {
				t.Fatal(err)
			}
			stub := &usecaseStub{organizations: tc.organizations, err: tc.err}
			app := fiber.New()
			app.Use(server.AuthMiddleware(func(_ context.Context, token string) (jwt.TokenClaims, error) {
				if token == "invalid" {
					return jwt.TokenClaims{}, errors.New("invalid token")
				}
				return jwt.TokenClaims{Role: token, OrganizationID: 1}, nil
			}))
			app.Get("/organization", New(&log, m, stub).GetAll)
			req := httptest.NewRequest("GET", "/organization", nil)
			if tc.token != "" {
				req.Header.Set("Authorization", "Bearer "+tc.token)
			}
			resp, err := app.Test(req)
			if err != nil {
				t.Fatal(err)
			}
			defer resp.Body.Close()
			body, err := io.ReadAll(resp.Body)
			if err != nil {
				t.Fatal(err)
			}
			if resp.StatusCode != tc.status {
				t.Fatalf("status=%d, want %d: %s", resp.StatusCode, tc.status, body)
			}
			if tc.body != "" && string(body) != tc.body {
				t.Fatalf("body=%s, want %s", body, tc.body)
			}
			if stub.called != tc.called {
				t.Fatalf("usecase called=%v, want %v", stub.called, tc.called)
			}
		})
	}
}

func TestGetAllInvalidClaims(t *testing.T) {
	for _, claims := range []any{nil, "admin"} {
		log := zerolog.Nop()
		m, err := metrics.New("organization_claims_test")
		if err != nil {
			t.Fatal(err)
		}
		stub := &usecaseStub{}
		app := fiber.New()
		app.Use(func(c fiber.Ctx) error {
			if claims != nil {
				c.Locals("tokenClaims", claims)
			}
			return c.Next()
		})
		app.Get("/organization", New(&log, m, stub).GetAll)
		resp, err := app.Test(httptest.NewRequest("GET", "/organization", nil))
		if err != nil {
			t.Fatal(err)
		}
		resp.Body.Close()
		if resp.StatusCode != 403 || stub.called {
			t.Fatalf("claims=%v: status=%d, called=%v", claims, resp.StatusCode, stub.called)
		}
	}
}
