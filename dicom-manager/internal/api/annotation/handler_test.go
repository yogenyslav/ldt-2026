package annotation_test

import (
	"context"
	"errors"
	"io"
	"net/http/httptest"
	"os"
	"strings"
	"testing"

	"github.com/gofiber/fiber/v3"
	"github.com/rs/zerolog"
	"github.com/stretchr/testify/require"
	"github.com/yogenyslav/ldt-2026/dicom-manager/internal/api/annotation/get_paginated"
	"github.com/yogenyslav/ldt-2026/dicom-manager/internal/api/annotation/model"
	"github.com/yogenyslav/ldt-2026/dicom-manager/internal/api/annotation/submit"
	storage "github.com/yogenyslav/ldt-2026/dicom-manager/internal/storage/annotation"
	uc "github.com/yogenyslav/ldt-2026/dicom-manager/internal/usecases/annotation"
	"github.com/yogenyslav/ldt-2026/dicom-manager/pkg/jwt"
	"github.com/yogenyslav/ldt-2026/dicom-manager/pkg/observability/metrics"
)

type stub struct {
	err    error
	filter storage.Filter
	claims jwt.TokenClaims
}

func (s *stub) Submit(_ context.Context, claims jwt.TokenClaims, in model.Submission) (model.SubmitResponse, error) {
	s.claims = claims
	return model.SubmitResponse{SubmissionID: in.SubmissionID, Warnings: []model.Warning{}}, s.err
}

func (s *stub) List(_ context.Context, claims jwt.TokenClaims, filter storage.Filter) (model.ListResponse, error) {
	s.claims, s.filter = claims, filter
	return model.ListResponse{Submissions: []model.Record{}}, s.err
}

func TestAnnotationHTTP(t *testing.T) {
	data, err := os.ReadFile("../../usecases/annotation/testdata/submission.json")
	require.NoError(t, err)
	for _, tc := range []struct {
		name, method, path, role, body string
		err                            error
		status                         int
	}{
		{"submit", "POST", "/submission", "admin", string(data), nil, 201},
		{"unauthorized", "POST", "/submission", "", string(data), nil, 401},
		{"specialist", "POST", "/submission", "specialist", string(data), nil, 403},
		{"broken json", "POST", "/submission", "admin", `{`, nil, 400},
		{"missing fields", "POST", "/submission", "admin", `{}`, nil, 400},
		{"missing image", "POST", "/submission", "admin", string(data), uc.ErrJobNotFound, 404},
		{"stale", "POST", "/submission", "admin", string(data), uc.ErrSuperseded, 409},
		{"id conflict", "POST", "/submission", "admin", string(data), uc.ErrIDConflict, 409},
		{"coordinates", "POST", "/submission", "admin", string(data), uc.ErrCoordinates, 422},
		{"internal", "POST", "/submission", "admin", string(data), errors.New("private-database-address"), 500},
		{"list", "GET", "/submissions", "admin", "", nil, 200},
		{"filtered", "GET", "/submissions?limit=2&offset=3&status=done&only_latest=false&job_id=job", "admin", "", nil, 200},
		{"bad limit", "GET", "/submissions?limit=201", "admin", "", nil, 400},
		{"negative offset", "GET", "/submissions?offset=-1", "admin", "", nil, 400},
		{"bad latest", "GET", "/submissions?only_latest=1", "admin", "", nil, 400},
	} {
		t.Run(tc.name, func(t *testing.T) {
			logger := zerolog.Nop()
			m, err := metrics.New("annotation_http")
			require.NoError(t, err)
			s := &stub{err: tc.err}
			app := fiber.New(fiber.Config{ErrorHandler: func(c fiber.Ctx, err error) error {
				var fe *fiber.Error
				require.ErrorAs(t, err, &fe)
				return c.Status(fe.Code).JSON(model.ErrorResponse{Message: fe.Message})
			}})
			app.Use(func(c fiber.Ctx) error {
				if tc.role != "" {
					c.Locals("tokenClaims", jwt.TokenClaims{UserID: 17, Role: tc.role, OrganizationID: 23})
				}
				return c.Next()
			})
			app.Post("/submission", submit.New(&logger, m, s).Submit)
			app.Get("/submissions", get_paginated.New(&logger, m, s).GetPaginated)
			req := httptest.NewRequest(tc.method, tc.path, strings.NewReader(tc.body))
			req.Header.Set("Content-Type", "application/json")
			resp, err := app.Test(req)
			require.NoError(t, err)
			defer resp.Body.Close()
			body, err := io.ReadAll(resp.Body)
			require.NoError(t, err)
			require.Equal(t, tc.status, resp.StatusCode, string(body))
			require.Contains(t, resp.Header.Get("Content-Type"), "application/json")
			require.NotContains(t, string(body), "private-database-address")
			if tc.status >= 400 {
				require.Contains(t, string(body), `"message":`)
			}
			if tc.status == 201 {
				require.Contains(t, string(body), `"warnings":[]`)
			}
			if tc.name == "list" {
				require.EqualValues(t, 50, s.filter.Limit)
				require.True(t, s.filter.OnlyLatest)
				require.EqualValues(t, 23, s.claims.OrganizationID)
			}
			if tc.name == "filtered" {
				require.Equal(t, storage.Filter{Limit: 2, Offset: 3, Status: "done", JobID: "job"}, s.filter)
			}
		})
	}
}
