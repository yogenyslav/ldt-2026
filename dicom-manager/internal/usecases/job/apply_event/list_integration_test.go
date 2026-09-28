package apply_event

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http/httptest"
	"reflect"
	"testing"

	"github.com/gofiber/fiber/v3"
	"github.com/rs/zerolog"
	api "github.com/yogenyslav/ldt-2026/dicom-manager/internal/api/job/get_paginated"
	storage "github.com/yogenyslav/ldt-2026/dicom-manager/internal/storage/job"
	list "github.com/yogenyslav/ldt-2026/dicom-manager/internal/usecases/job/get_paginated"
	"github.com/yogenyslav/ldt-2026/dicom-manager/pkg/jwt"
	"github.com/yogenyslav/ldt-2026/dicom-manager/pkg/observability/metrics"
)

// TestIntegrationListJobs проверяет весь путь handler → usecase → SQL с изоляцией организаций.
func TestIntegrationListJobs(t *testing.T) {
	db := integrationDB(t)
	ctx := context.Background()
	_, err := db.Exec(ctx, `insert into organization(id,name) values (101,'one'),(102,'two');
		insert into "user"(id,organization_id,full_name,email,password_hash,role) values
		(101,101,'admin','admin@one.test','test','admin'),
		(102,101,'specialist','specialist@one.test','test','specialist'),
		(103,101,'Orthanc account','orthanc@one.test','test','specialist'),
		(104,102,'other admin','admin@two.test','test','admin');`)
	if err != nil {
		t.Fatal(err)
	}
	for i, fixture := range []struct {
		id           string
		creator, org int64
	}{
		{"manual", 102, 101}, {"orthanc", 103, 101}, {"other-org", 104, 102},
	} {
		_, err = db.Exec(ctx, `insert into dicom_file(id,file_name,study_id,series_id,dicom_study_uid,dicom_series_uid,dicom_image_uid,creator_id,organization_id)
			values($1,'image.dcm','study','series','study','series','image',$2,$3)`, fixture.id, fixture.creator, fixture.org)
		if err != nil {
			t.Fatal(err)
		}
		_, err = db.Exec(ctx, `insert into dicom_job_result(job_id,dicom_file_id,created_at)
			values($1,$2,'2026-09-29T00:00:00Z')`, fmt.Sprintf("00000000-0000-0000-0000-%012d", i+1), fixture.id)
		if err != nil {
			t.Fatal(err)
		}
	}
	logger := zerolog.Nop()
	m, err := metrics.New("list_test")
	if err != nil {
		t.Fatal(err)
	}
	uc := list.New(&logger, m, storage.New(db))
	for _, tc := range []struct {
		name, role string
		user, org  int64
		query      string
		want       []string
	}{
		{"admin includes Orthanc account", "admin", 101, 101, "", []string{"orthanc", "manual"}},
		{"admin pagination", "admin", 101, 101, "?offset=1&limit=1", []string{"manual"}},
		{"other organization", "admin", 104, 102, "", []string{"other-org"}},
		{"specialist owns only manual", "specialist", 102, 101, "", []string{"manual"}},
		{"Orthanc account owns only Orthanc", "specialist", 103, 101, "", []string{"orthanc"}},
		{"query cannot override JWT scope", "specialist", 102, 101, "?role=admin&organization_id=102", []string{"manual"}},
		{"unknown role does not get admin access", "unknown", 101, 101, "", []string{}},
		{"empty organization", "admin", 101, 999, "", []string{}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			app := fiber.New()
			app.Use(func(c fiber.Ctx) error {
				c.Locals("tokenClaims", jwt.TokenClaims{UserID: tc.user, OrganizationID: tc.org, Role: tc.role})
				return c.Next()
			})
			app.Get("/job/info", api.New(&logger, m, uc).GetPaginated)
			resp, err := app.Test(httptest.NewRequest("GET", "/job/info"+tc.query, nil))
			if err != nil {
				t.Fatal(err)
			}
			defer resp.Body.Close()
			if resp.StatusCode != 200 {
				t.Fatalf("status=%d", resp.StatusCode)
			}
			var out struct {
				Jobs []struct {
					DicomID string `json:"dicom_id"`
				} `json:"jobs"`
			}
			if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
				t.Fatal(err)
			}
			ids := make([]string, 0, len(out.Jobs))
			for _, job := range out.Jobs {
				ids = append(ids, job.DicomID)
			}
			if !reflect.DeepEqual(ids, tc.want) {
				t.Fatalf("got %v, want %v", ids, tc.want)
			}
		})
	}
}
