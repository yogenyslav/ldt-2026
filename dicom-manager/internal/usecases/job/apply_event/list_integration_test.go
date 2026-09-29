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
	bydicomapi "github.com/yogenyslav/ldt-2026/dicom-manager/internal/api/job/get_by_dicom_id"
	byidapi "github.com/yogenyslav/ldt-2026/dicom-manager/internal/api/job/get_by_id"
	api "github.com/yogenyslav/ldt-2026/dicom-manager/internal/api/job/get_paginated"
	dicomstorage "github.com/yogenyslav/ldt-2026/dicom-manager/internal/storage/dicom"
	storage "github.com/yogenyslav/ldt-2026/dicom-manager/internal/storage/job"
	bydicom "github.com/yogenyslav/ldt-2026/dicom-manager/internal/usecases/job/get_by_dicom_id"
	byid "github.com/yogenyslav/ldt-2026/dicom-manager/internal/usecases/job/get_by_id"
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
		id, source   string
		creator, org int64
	}{
		{"manual", "manual", 102, 101}, {"orthanc", "clinic", 103, 101}, {"other-org", "manual", 104, 102},
	} {
		_, err = db.Exec(ctx, `insert into dicom_file(id,file_name,study_id,series_id,dicom_study_uid,dicom_series_uid,dicom_image_uid,creator_id,organization_id,upload_source)
			values($1,'image.dcm','study','series','study','series','image',$2,$3,$4)`, fixture.id, fixture.creator, fixture.org, fixture.source)
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
		{"admin multiple organizations", "admin", 101, 101, "?organization_ids=101,102", []string{"other-org", "orthanc", "manual"}},
		{"combined filters", "admin", 101, 101, "?organization_ids=101,102&upload_source=manual", []string{"other-org", "manual"}},
		{"filtered pagination", "admin", 101, 101, "?organization_ids=101,102&upload_source=manual&offset=1&limit=1", []string{"manual"}},
		{"both sources", "admin", 101, 101, "?upload_source=manual,clinic", []string{"orthanc", "manual"}},
		{"both sources and organizations", "admin", 101, 101, "?organization_ids=101,102&upload_source=manual,clinic", []string{"other-org", "orthanc", "manual"}},
		{"both sources pagination", "admin", 101, 101, "?upload_source=manual,clinic&offset=1&limit=1", []string{"manual"}},
		{"duplicate sources", "admin", 101, 101, "?upload_source=manual,manual", []string{"manual"}},
		{"both sources preserve access", "specialist", 102, 101, "?upload_source=manual,clinic", []string{"manual"}},
		{"automatic only", "admin", 101, 101, "?upload_source=clinic", []string{"orthanc"}},
		{"duplicate organizations", "admin", 101, 101, "?organization_ids=101,101&upload_source=manual", []string{"manual"}},
		{"specialist filters do not expand access", "specialist", 102, 101, "?organization_ids=101,102", []string{"manual"}},
		{"specialist foreign organization", "specialist", 102, 101, "?organization_ids=102", []string{}},
		{"specialist automatic not owned", "specialist", 102, 101, "?upload_source=clinic", []string{}},
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
					DicomID      string `json:"dicom_id"`
					UploadSource string `json:"upload_source"`
				} `json:"jobs"`
			}
			if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
				t.Fatal(err)
			}
			ids := make([]string, 0, len(out.Jobs))
			for _, job := range out.Jobs {
				ids = append(ids, job.DicomID)
				expectedSource := "manual"
				if job.DicomID == "orthanc" {
					expectedSource = "clinic"
				}
				if job.UploadSource != expectedSource {
					t.Fatalf("source=%q for %s", job.UploadSource, job.DicomID)
				}
			}
			if !reflect.DeepEqual(ids, tc.want) {
				t.Fatalf("got %v, want %v", ids, tc.want)
			}
		})
	}
	// Проверяем одиночную задачу и историю DICOM через настоящие handler/usecase/SQL.
	for _, tc := range []struct {
		name, path, source string
		user               int64
		role               string
		status, count      int
	}{
		{"by ID both sources", "/job/info/00000000-0000-0000-0000-000000000001?upload_source=manual,clinic", "manual", 102, "specialist", 200, 1},
		{"by DICOM both sources", "/dicom/orthanc/jobs?upload_source=manual,clinic", "clinic", 101, "admin", 200, 1},
		{"invalid mixed sources", "/job/info?upload_source=manual,invalid", "", 101, "admin", 400, 0},
		{"empty source item", "/job/info?upload_source=manual,", "", 101, "admin", 400, 0},
		{"by ID manual", "/job/info/00000000-0000-0000-0000-000000000001", "manual", 102, "specialist", 200, 1},
		{"by ID Orthanc", "/job/info/00000000-0000-0000-0000-000000000002?organization_ids=101&upload_source=clinic", "clinic", 101, "admin", 200, 1},
		{"by ID wrong organization", "/job/info/00000000-0000-0000-0000-000000000002?organization_ids=102", "", 101, "admin", 404, 0},
		{"by ID wrong source", "/job/info/00000000-0000-0000-0000-000000000002?upload_source=manual", "", 101, "admin", 404, 0},
		{"by ID forbidden", "/job/info/00000000-0000-0000-0000-000000000002?organization_ids=101", "", 102, "specialist", 403, 0},
		{"by DICOM Orthanc", "/dicom/orthanc/jobs?organization_ids=101,102&upload_source=clinic", "clinic", 101, "admin", 200, 1},
		{"by DICOM manual", "/dicom/manual/jobs", "manual", 102, "specialist", 200, 1},
		{"by DICOM wrong source", "/dicom/orthanc/jobs?upload_source=manual", "", 101, "admin", 200, 0},
		{"by DICOM wrong organization", "/dicom/orthanc/jobs?organization_ids=102", "", 101, "admin", 200, 0},
		{"by DICOM forbidden", "/dicom/orthanc/jobs?organization_ids=101", "", 102, "specialist", 403, 0},
		{"invalid source list", "/job/info?upload_source=invalid", "", 101, "admin", 400, 0},
		{"invalid org list", "/job/info?organization_ids=101,no", "", 101, "admin", 400, 0},
		{"invalid org by ID", "/job/info/00000000-0000-0000-0000-000000000001?organization_ids=-1", "", 101, "admin", 400, 0},
		{"invalid source by DICOM", "/dicom/manual/jobs?upload_source=invalid", "", 101, "admin", 400, 0},
	} {
		t.Run(tc.name, func(t *testing.T) {
			app := fiber.New()
			app.Use(func(c fiber.Ctx) error {
				c.Locals("tokenClaims", jwt.TokenClaims{UserID: tc.user, OrganizationID: 101, Role: tc.role})
				return c.Next()
			})
			jr, dr := storage.New(db), dicomstorage.New(db)
			app.Get("/job/info", api.New(&logger, m, uc).GetPaginated)
			app.Get("/job/info/:job_id", byidapi.New(&logger, m, byid.New(&logger, m, jr, dr)).GetByID)
			app.Get("/dicom/:dicom_id/jobs", bydicomapi.New(&logger, m, bydicom.New(&logger, m, jr, dr)).GetByDicomID)
			resp, err := app.Test(httptest.NewRequest("GET", tc.path, nil))
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
			var out struct {
				Job *struct {
					UploadSource string `json:"upload_source"`
				} `json:"job"`
				Jobs []struct {
					UploadSource string `json:"upload_source"`
				} `json:"jobs"`
			}
			if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
				t.Fatal(err)
			}
			count := len(out.Jobs)
			if out.Job != nil {
				count++
				if out.Job.UploadSource != tc.source {
					t.Fatalf("source=%q", out.Job.UploadSource)
				}
			}
			if count != tc.count {
				t.Fatalf("count=%d want=%d", count, tc.count)
			}
			for _, job := range out.Jobs {
				if job.UploadSource != tc.source {
					t.Fatalf("source=%q", job.UploadSource)
				}
			}
		})
	}

}
