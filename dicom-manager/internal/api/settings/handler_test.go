package settings_test

import (
	"context"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gofiber/fiber/v3"
	"github.com/rs/zerolog"
	api_get "github.com/yogenyslav/ldt-2026/dicom-manager/internal/api/settings/get"
	api_save "github.com/yogenyslav/ldt-2026/dicom-manager/internal/api/settings/save"
	uc_get "github.com/yogenyslav/ldt-2026/dicom-manager/internal/usecases/settings/get"
	uc_save "github.com/yogenyslav/ldt-2026/dicom-manager/internal/usecases/settings/save"
	"github.com/yogenyslav/ldt-2026/dicom-manager/pkg/events"
	"github.com/yogenyslav/ldt-2026/dicom-manager/pkg/jwt"
	"github.com/yogenyslav/ldt-2026/dicom-manager/pkg/observability/metrics"
)

type repoStub struct {
	organizationID int64
	saved          map[string]float64
}

func (r *repoStub) Get(_ context.Context, id int64) (map[string]float64, error) {
	r.organizationID = id

	return events.ResolveSettings(r.saved)
}

func (r *repoStub) Save(_ context.Context, id int64, settings map[string]float64) error {
	r.organizationID = id
	r.saved = settings

	return nil
}

func TestSettingsAuthorizationAndValidation(t *testing.T) {
	const valid = `{"trochanter_center_mm":3,"trochanter_tol_percent":50,"trochanter_yellow_percent":20}`

	for _, tc := range []struct {
		method, role, body string
		status             int
	}{
		{"GET", "", "", 401}, {"PUT", "doctor", valid, 403}, {"GET", "doctor", "", 403},
		{"GET", "admin", "", 200}, {"PUT", "admin", valid, 200},
		{"PUT", "admin", `{}`, 400}, {"PUT", "admin", `null`, 400},
		{"PUT", "admin", `{"trochanter_center_mm":null,"trochanter_tol_percent":50,"trochanter_yellow_percent":20}`, 400},
		{"PUT", "admin", `{"trochanter_center_mm":3,"trochanter_tol_percent":99,"trochanter_yellow_percent":20}`, 400},
		{"PUT", "admin", `{"trochanter_center_mm":3,"trochanter_tol_percent":50,"unknown":20}`, 400},
	} {
		t.Run(tc.method+tc.role+tc.body, func(t *testing.T) {
			repo := &repoStub{}
			log := zerolog.Nop()
			metricClient, err := metrics.New("settings_handler_test")
			if err != nil {
				t.Fatal(err)
			}

			getHandler := api_get.New(&log, metricClient, uc_get.New(&log, metricClient, repo))
			saveHandler := api_save.New(&log, metricClient, uc_save.New(&log, metricClient, repo))
			app := fiber.New()
			app.Use(func(c fiber.Ctx) error {
				if tc.role != "" {
					c.Locals("tokenClaims", jwt.TokenClaims{UserID: 1, OrganizationID: 23, Role: tc.role})
				}

				return c.Next()
			})
			app.Get("/settings", getHandler.Get)
			app.Put("/settings", saveHandler.Save)
			request := httptest.NewRequest(tc.method, "/settings", strings.NewReader(tc.body))
			request.Header.Set("Content-Type", "application/json")
			response, err := app.Test(request)
			if err != nil {
				t.Fatal(err)
			}

			defer response.Body.Close()
			if response.StatusCode != tc.status {
				t.Fatalf("status %d, want %d", response.StatusCode, tc.status)
			}

			if tc.status == 200 && repo.organizationID != 23 {
				t.Fatal("organization scope lost")
			}

			if tc.status != 200 && repo.organizationID != 0 {
				t.Fatal("invalid request reached repository")
			}

			if tc.method == "PUT" && tc.status == 200 && repo.saved["trochanter_center_mm"] != 3 {
				t.Fatal("settings not saved")
			}
		})
	}
}
