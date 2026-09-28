package get_by_id

import (
	"context"
	"encoding/json"
	"errors"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/jackc/pgx/v5"
	"github.com/rs/zerolog"
	storage "github.com/yogenyslav/ldt-2026/dicom-manager/internal/storage/dicom"
	uc "github.com/yogenyslav/ldt-2026/dicom-manager/internal/usecases/dicom/get_by_id"
	"github.com/yogenyslav/ldt-2026/dicom-manager/pkg/jwt"
	"github.com/yogenyslav/ldt-2026/dicom-manager/pkg/observability/metrics"
)

type repoStub struct {
	file storage.Dicom
	err  error
}

func (r repoStub) GetByID(_ context.Context, id string) (storage.Dicom, error) {
	if id != "dicom" {
		return storage.Dicom{}, errors.New("unexpected ID")
	}
	return r.file, r.err
}

func TestGetByID(t *testing.T) {
	file := storage.Dicom{ID: "dicom", CreatorID: 42, OrganizationID: 218, FileName: "file", PatientID: "p1", DeviceModel: "Manufacturer=Maker", CreatedAt: time.Date(2026, 9, 29, 0, 0, 0, 0, time.UTC)}
	for _, tc := range []struct {
		name   string
		user   int64
		role   string
		err    error
		status int
	}{
		{"owner", 42, "specialist", nil, 200}, {"admin", 99, "admin", nil, 200},
		{"forbidden", 99, "specialist", nil, 403}, {"unauthorized", 0, "", nil, 401},
		{"missing", 42, "specialist", pgx.ErrNoRows, 404}, {"database error", 42, "specialist", errors.New("db unavailable"), 500},
	} {
		t.Run(tc.name, func(t *testing.T) {
			log := zerolog.Nop()
			m, err := metrics.New("dicom_get_test")
			if err != nil {
				t.Fatal(err)
			}
			app := fiber.New()
			app.Use(func(c fiber.Ctx) error {
				if tc.user != 0 {
					c.Locals("tokenClaims", jwt.TokenClaims{UserID: tc.user, Role: tc.role})
				}
				return c.Next()
			})
			app.Get("/dicom/:dicom_id", New(&log, m, uc.New(&log, m, repoStub{file, tc.err})).GetByID)
			resp, err := app.Test(httptest.NewRequest("GET", "/dicom/dicom", nil))
			if err != nil {
				t.Fatal(err)
			}
			defer resp.Body.Close()
			if resp.StatusCode != tc.status {
				t.Fatalf("status=%d want=%d", resp.StatusCode, tc.status)
			}
			if tc.status != 200 {
				return
			}
			var body map[string]any
			if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
				t.Fatal(err)
			}
			for _, field := range []string{"updated_at", "patient_name", "patient_birth_date", "patient_sex"} {
				if _, ok := body[field]; ok {
					t.Fatalf("unexpected field %s", field)
				}
			}
			if len(body) != 12 || body["id"] != "dicom" || body["patient_id"] != file.PatientID || body["device_model"] != file.DeviceModel || body["created_at"] != "2026-09-29T00:00:00Z" {
				t.Fatalf("response=%v", body)
			}
		})
	}
}
