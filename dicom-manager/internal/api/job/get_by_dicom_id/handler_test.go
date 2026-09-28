package get_by_dicom_id

import (
	"context"
	"encoding/json"
	"errors"
	"net/http/httptest"
	"testing"

	"github.com/gofiber/fiber/v3"
	"github.com/rs/zerolog"
	uc "github.com/yogenyslav/ldt-2026/dicom-manager/internal/usecases/job/get_by_dicom_id"
	"github.com/yogenyslav/ldt-2026/dicom-manager/pkg/jwt"
	"github.com/yogenyslav/ldt-2026/dicom-manager/pkg/observability/metrics"
)

type usecaseStub struct {
	err    error
	jobs   []uc.Job
	called bool
}

func (s *usecaseStub) GetByDicomID(_ context.Context, in uc.GetJobsRequest) ([]uc.Job, error) {
	s.called = true
	if in.DicomID != "instance" || in.RequesterID != 42 || in.RequesterRole != "specialist" {
		panic("incorrect request")
	}
	return s.jobs, s.err
}
func TestGetByDicomID(t *testing.T) {
	for _, tc := range []struct {
		name          string
		err           error
		status        int
		noAuth, empty bool
	}{
		{name: "all attempts", status: 200},
		{name: "empty list", status: 200, empty: true},
		{name: "unauthorized", status: 401, noAuth: true},
		{name: "forbidden", status: 403, err: uc.ErrDicomForbidden},
		{name: "not found", status: 404, err: uc.ErrDicomNotFound},
		{name: "storage failure", status: 500, err: errors.New("database failed")},
	} {
		t.Run(tc.name, func(t *testing.T) {
			logger := zerolog.Nop()
			m, err := metrics.New("test")
			if err != nil {
				t.Fatal(err)
			}
			stub := &usecaseStub{err: tc.err}
			if !tc.empty {
				stub.jobs = []uc.Job{
					{ID: "new", DicomFileID: "instance", Status: "running"},
					{ID: "old", DicomFileID: "instance", Status: "failed", Metadata: []byte(`{"error":"analysis failed"}`)},
				}
			}
			app := fiber.New()
			if !tc.noAuth {
				app.Use(func(c fiber.Ctx) error {
					c.Locals("tokenClaims", jwt.TokenClaims{UserID: 42, Role: "specialist"})
					return c.Next()
				})
			}
			app.Get("/dicom/:dicom_id/jobs", New(&logger, m, stub).GetByDicomID)
			resp, err := app.Test(httptest.NewRequest("GET", "/dicom/instance/jobs", nil))
			if err != nil {
				t.Fatal(err)
			}
			defer resp.Body.Close()
			if resp.StatusCode != tc.status {
				t.Fatalf("status=%d want=%d", resp.StatusCode, tc.status)
			}
			if tc.noAuth && stub.called {
				t.Fatal("unauthorized request reached usecase")
			}
			if tc.status == 200 {
				var out GetByDicomIDOut
				if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
					t.Fatal(err)
				}
				if out.Jobs == nil {
					t.Fatal("jobs must be an array")
				}
				if tc.empty {
					if len(out.Jobs) != 0 {
						t.Fatal("expected empty jobs")
					}
				} else if len(out.Jobs) != 2 || out.Jobs[0].Status != "processing" || out.Jobs[1].Error != "analysis failed" {
					t.Fatalf("incorrect jobs: %+v", out.Jobs)
				}
			}
		})
	}
}
