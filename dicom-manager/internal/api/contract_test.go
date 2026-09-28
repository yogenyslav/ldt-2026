package api_test

import (
	"archive/zip"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http/httptest"
	"strings"
	"testing"
	"uuid"

	"github.com/gofiber/fiber/v3"
	"github.com/rs/zerolog"
	imageapi "github.com/yogenyslav/ldt-2026/dicom-manager/internal/api/dicom/get_image"
	uploadapi "github.com/yogenyslav/ldt-2026/dicom-manager/internal/api/dicom/upload"
	batchapi "github.com/yogenyslav/ldt-2026/dicom-manager/internal/api/dicom/upload_batch"
	jobapi "github.com/yogenyslav/ldt-2026/dicom-manager/internal/api/job/get_by_id"
	jobsapi "github.com/yogenyslav/ldt-2026/dicom-manager/internal/api/job/get_paginated"
	decisionapi "github.com/yogenyslav/ldt-2026/dicom-manager/internal/api/job/result_decision"
	generateapi "github.com/yogenyslav/ldt-2026/dicom-manager/internal/api/report/generate"
	reportapi "github.com/yogenyslav/ldt-2026/dicom-manager/internal/api/report/get_by_id"
	reportsapi "github.com/yogenyslav/ldt-2026/dicom-manager/internal/api/report/get_paginated"
	loginapi "github.com/yogenyslav/ldt-2026/dicom-manager/internal/api/user/login"
	imageuc "github.com/yogenyslav/ldt-2026/dicom-manager/internal/usecases/dicom/get_image"
	uploaduc "github.com/yogenyslav/ldt-2026/dicom-manager/internal/usecases/dicom/upload"
	decisionuc "github.com/yogenyslav/ldt-2026/dicom-manager/internal/usecases/job/decision"
	jobuc "github.com/yogenyslav/ldt-2026/dicom-manager/internal/usecases/job/get_by_id"
	jobsuc "github.com/yogenyslav/ldt-2026/dicom-manager/internal/usecases/job/get_paginated"
	generateuc "github.com/yogenyslav/ldt-2026/dicom-manager/internal/usecases/report/generate"
	reportuc "github.com/yogenyslav/ldt-2026/dicom-manager/internal/usecases/report/get_by_id"
	reportsuc "github.com/yogenyslav/ldt-2026/dicom-manager/internal/usecases/report/get_paginated"
	"github.com/yogenyslav/ldt-2026/dicom-manager/internal/usecases/user/auth"
	"github.com/yogenyslav/ldt-2026/dicom-manager/pkg/jwt"
	"github.com/yogenyslav/ldt-2026/dicom-manager/pkg/observability/metrics"
	"github.com/yogenyslav/ldt-2026/dicom-manager/pkg/server"
)

type loginStub struct{}

func (loginStub) Login(_ context.Context, in auth.LoginRequest) (auth.UserAuthData, error) {
	if in.Email == "missing@example.com" {
		return auth.UserAuthData{}, auth.ErrUserNotFound
	}
	if in.RawPassword != "correct" {
		return auth.UserAuthData{}, auth.ErrInvalidCredentials
	}
	return auth.UserAuthData{Token: "token", UserID: 42, OrganizationID: 218, Role: auth.RoleUser}, nil
}

type uploadStub struct {
	last uploaduc.DicomUploadRequest
	err  error
}

func (s *uploadStub) UploadDicomFiles(_ context.Context, in uploaduc.DicomUploadRequest) (map[string]uuid.UUID, error) {
	s.last = in
	return map[string]uuid.UUID{"dicom": uuid.New()}, s.err
}

type imageStub struct{}

func (imageStub) GetImageByID(_ context.Context, in imageuc.GetImageRequest) (imageuc.ImageData, error) {
	if in.RequesterID != 42 || in.RequesterRole != "specialist" || in.DicomID != "dicom" {
		return imageuc.ImageData{}, fmt.Errorf("wrong image request: %+v", in)
	}
	return imageuc.ImageData{DataBase64: "aW1hZ2U="}, nil
}

type jobStub struct{}

func (jobStub) GetByID(_ context.Context, in jobuc.GetJobRequest) (jobuc.Job, error) {
	if in.RequesterID != 42 {
		return jobuc.Job{}, fmt.Errorf("wrong requester")
	}
	return jobuc.Job{ID: in.JobID, Status: "running"}, nil
}

type jobsStub struct{}

func (jobsStub) GetPaginated(_ context.Context, in jobsuc.GetJobsRequest) ([]jobsuc.Job, error) {
	if in.CreatorID != 42 || in.Offset != 2 || in.Limit != 3 {
		return nil, fmt.Errorf("wrong pagination or creator: %+v", in)
	}
	return []jobsuc.Job{{ID: "failed", Status: "failed", Metadata: []byte(`{"error":"analysis failed"}`)}}, nil
}

type decisionStub struct{}

func (decisionStub) UpdateDecision(_ context.Context, in decisionuc.UpdateDecisionRequest) error {
	if in.SpecialistID != 42 || len(in.JobIDs) != 1 || in.ResultDecision != "rejected" {
		return fmt.Errorf("wrong decision: %+v", in)
	}
	return nil
}

type generateStub struct{}

func (generateStub) GenerateReport(_ context.Context, in generateuc.GenerateReportRequest) (int64, error) {
	if in.CreatorID != 42 || len(in.JobIDs) != 1 {
		return 0, fmt.Errorf("wrong report request")
	}
	return 7, nil
}

type reportStub struct{}

func (reportStub) GetReportByID(_ context.Context, in reportuc.GetReportRequest) (reportuc.ReportData, error) {
	if in.RequesterID != 42 || in.ReportID != 7 {
		return reportuc.ReportData{}, fmt.Errorf("wrong report requester")
	}
	return reportuc.ReportData{ID: 7, PresignedURL: "https://storage.example/report"}, nil
}

type reportsStub struct{}

func (reportsStub) GetPaginated(_ context.Context, in reportsuc.GetPaginatedRequest) ([]reportsuc.ReportData, error) {
	if in.RequesterID != 42 {
		return nil, fmt.Errorf("wrong requester")
	}
	return nil, nil
}

func TestBrowserAPIContract(t *testing.T) {
	log := zerolog.Nop()
	m, err := metrics.New("contract")
	if err != nil {
		t.Fatal(err)
	}
	app := fiber.New()
	app.Post("/user/login", loginapi.New(&log, m, loginStub{}).Login)
	app.Use(server.AuthMiddleware(func(_ context.Context, token string) (jwt.TokenClaims, error) {
		if token != "token" {
			return jwt.TokenClaims{}, fmt.Errorf("invalid token")
		}
		return jwt.TokenClaims{UserID: 42, OrganizationID: 218, Role: "specialist"}, nil
	}))
	app.Get("/dicom/:dicom_id/image", imageapi.New(&log, m, imageStub{}).GetImage)
	uploads := &uploadStub{}
	app.Post("/dicom/upload", uploadapi.New(&log, m, uploads).Upload)
	app.Post("/dicom/upload/batch", batchapi.New(&log, m, uploads).UploadBatch)
	app.Get("/job/info/:job_id", jobapi.New(&log, m, jobStub{}).GetByID)
	app.Get("/job/info", jobsapi.New(&log, m, jobsStub{}).GetPaginated)
	app.Post("/job/result/decision", decisionapi.New(&log, m, decisionStub{}).ResultDecision)
	app.Post("/report/generate", generateapi.New(&log, m, generateStub{}).Generate)
	app.Get("/report/:report_id", reportapi.New(&log, m, reportStub{}).GetByID)
	app.Get("/report/", reportsapi.New(&log, m, reportsStub{}).GetPaginated)
	request := func(method, path, contentType string, body io.Reader, token string, status int) string {
		t.Helper()
		req := httptest.NewRequest(method, path, body)
		req.Header.Set("Content-Type", contentType)
		if token != "" {
			req.Header.Set("Authorization", "Bearer "+token)
		}
		resp, err := app.Test(req)
		if err != nil {
			t.Fatal(err)
		}
		defer resp.Body.Close()
		data, err := io.ReadAll(resp.Body)
		if err != nil {
			t.Fatal(err)
		}
		if resp.StatusCode != status {
			t.Fatalf("%s %s: status %d, want %d: %s", method, path, resp.StatusCode, status, data)
		}
		return string(data)
	}
	t.Run("login", func(t *testing.T) {
		data := request("POST", "/user/login", "application/json", strings.NewReader(`{"email":"user@example.com","password":"correct"}`), "", 200)
		var out map[string]any
		if err := json.Unmarshal([]byte(data), &out); err != nil {
			t.Fatal(err)
		}
		if out["organization_id"] != float64(218) || out["role"] != "specialist" || out["token"] != "token" {
			t.Fatal(data)
		}
		for _, body := range []string{`{"email":"missing@example.com","password":"correct"}`, `{"email":"user@example.com","password":"wrong"}`} {
			request("POST", "/user/login", "application/json", strings.NewReader(body), "", 401)
		}
		request("POST", "/user/login", "application/json", strings.NewReader(`{"username":"user","password":"correct"}`), "", 400)
	})
	t.Run("auth and JSON endpoints", func(t *testing.T) {
		request("GET", "/job/info", "", nil, "", 401)
		request("GET", "/dicom/dicom/image", "", nil, "token", 200)
		data := request("GET", "/job/info/job", "", nil, "token", 200)
		if !strings.Contains(data, `"status":"processing"`) {
			t.Fatal(data)
		}
		data = request("GET", "/job/info?offset=2&limit=3", "", nil, "token", 200)
		if !strings.Contains(data, `"error":"analysis failed"`) {
			t.Fatal(data)
		}
		request("POST", "/job/result/decision", "application/json", strings.NewReader(`{"job_ids":["job"],"decision":"rejected"}`), "token", 204)
		request("POST", "/report/generate", "application/json", strings.NewReader(`{"job_ids":["job"]}`), "token", 200)
		request("GET", "/report/7", "", nil, "token", 200)
		if data := request("GET", "/report", "", nil, "token", 200); data != `{"reports":[]}` {
			t.Fatal(data)
		}
	})
	t.Run("binary DICOM", func(t *testing.T) {
		payload := []byte{0, 1, 2, 255}
		request("POST", "/dicom/upload", "application/dicom", bytes.NewReader(payload), "token", 201)
		if len(uploads.last.RawDicoms) != 1 || !bytes.Equal(uploads.last.RawDicoms[0].Payload, payload) || !uploads.last.SyncOrthanc || uploads.last.CreatorID != 42 {
			t.Fatalf("wrong upload: %+v", uploads.last)
		}
	})
	t.Run("authenticated Orthanc callback does not upload again", func(t *testing.T) {
		for _, token := range []string{"", "token"} {
			req := httptest.NewRequest("POST", "/dicom/upload", strings.NewReader("dicom data"))
			req.Header.Set("Content-Type", "application/dicom")
			req.Header.Set("X-Instance-ID", "orthanc-instance")
			if token != "" {
				req.Header.Set("Authorization", "Bearer "+token)
			}
			resp, err := app.Test(req)
			if err != nil {
				t.Fatal(err)
			}
			resp.Body.Close()
			if token == "" {
				if resp.StatusCode != 401 {
					t.Fatalf("instance header bypassed authentication: %d", resp.StatusCode)
				}
				continue
			}
			if resp.StatusCode != 201 || uploads.last.SyncOrthanc ||
				len(uploads.last.RawDicoms) != 1 || uploads.last.RawDicoms[0].InstanceID != "orthanc-instance" ||
				uploads.last.CreatorID != 42 || uploads.last.OrganizationID != 218 {
				t.Fatalf("wrong Orthanc callback: status=%d request=%+v", resp.StatusCode, uploads.last)
			}
		}
	})
	t.Run("browser multipart ZIP", func(t *testing.T) {
		var archive bytes.Buffer
		zw := zip.NewWriter(&archive)
		f, err := zw.Create("scan.DCM")
		if err != nil {
			t.Fatal(err)
		}
		if _, err := f.Write([]byte("dicom data")); err != nil {
			t.Fatal(err)
		}
		if err := zw.Close(); err != nil {
			t.Fatal(err)
		}
		var body bytes.Buffer
		mw := multipart.NewWriter(&body)
		part, err := mw.CreateFormFile("file", "scans.ZIP")
		if err != nil {
			t.Fatal(err)
		}
		if _, err := part.Write(archive.Bytes()); err != nil {
			t.Fatal(err)
		}
		if err := mw.Close(); err != nil {
			t.Fatal(err)
		}
		request("POST", "/dicom/upload/batch", mw.FormDataContentType(), &body, "token", 201)
		if len(uploads.last.RawDicoms) != 1 || string(uploads.last.RawDicoms[0].Payload) != "dicom data" || uploads.last.OrganizationID != 218 {
			t.Fatalf("wrong ZIP upload: %+v", uploads.last)
		}
	})
}

func TestUploadRetryErrors(t *testing.T) {
	for _, tc := range []struct {
		name   string
		err    error
		status int
	}{
		{"forbidden", fmt.Errorf("transaction failed: %w", uploaduc.ErrDicomForbidden), 403},
		{"active job", fmt.Errorf("transaction failed: %w", uploaduc.ErrActiveJob), 409},
	} {
		for _, batch := range []bool{false, true} {
			t.Run(fmt.Sprintf("%s/batch=%v", tc.name, batch), func(t *testing.T) {
				logger := zerolog.Nop()
				m, err := metrics.New("retry_contract")
				if err != nil {
					t.Fatal(err)
				}
				app := fiber.New()
				app.Use(func(c fiber.Ctx) error {
					c.Locals("tokenClaims", jwt.TokenClaims{UserID: 42, OrganizationID: 218})
					return c.Next()
				})
				stub := &uploadStub{err: tc.err}
				path, contentType := "/dicom/upload", "application/dicom"
				var body io.Reader = strings.NewReader("dicom")
				if batch {
					path = "/dicom/upload/batch"
					var zipData bytes.Buffer
					zw := zip.NewWriter(&zipData)
					f, err := zw.Create("test.dcm")
					if err != nil {
						t.Fatal(err)
					}
					if _, err = f.Write([]byte("dicom")); err != nil {
						t.Fatal(err)
					}
					if err = zw.Close(); err != nil {
						t.Fatal(err)
					}
					var multipartData bytes.Buffer
					mw := multipart.NewWriter(&multipartData)
					part, err := mw.CreateFormFile("file", "test.zip")
					if err != nil {
						t.Fatal(err)
					}
					if _, err = part.Write(zipData.Bytes()); err != nil {
						t.Fatal(err)
					}
					if err = mw.Close(); err != nil {
						t.Fatal(err)
					}
					contentType, body = mw.FormDataContentType(), &multipartData
					app.Post(path, batchapi.New(&logger, m, stub).UploadBatch)
				} else {
					app.Post(path, uploadapi.New(&logger, m, stub).Upload)
				}
				req := httptest.NewRequest("POST", path, body)
				req.Header.Set("Content-Type", contentType)
				resp, err := app.Test(req)
				if err != nil {
					t.Fatal(err)
				}
				defer resp.Body.Close()
				if resp.StatusCode != tc.status {
					t.Fatalf("status=%d want=%d", resp.StatusCode, tc.status)
				}
			})
		}
	}
}
