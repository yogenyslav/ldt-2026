package upload

import (
	"context"
	"net/http/httptest"
	"strings"
	"testing"
	"uuid"

	"github.com/gofiber/fiber/v3"
	"github.com/rs/zerolog"
	"github.com/stretchr/testify/require"
	uc "github.com/yogenyslav/ldt-2026/dicom-manager/internal/usecases/dicom/upload"
	"github.com/yogenyslav/ldt-2026/dicom-manager/pkg/jwt"
	"github.com/yogenyslav/ldt-2026/dicom-manager/pkg/observability/metrics"
)

type uploadStub struct{ request uc.DicomUploadRequest }

func (s *uploadStub) UploadDicomFiles(_ context.Context, in uc.DicomUploadRequest) (map[string]uuid.UUID, error) {
	s.request = in
	return map[string]uuid.UUID{"dicom": uuid.New()}, nil
}

func TestUploadFileName(t *testing.T) {
	for _, tc := range []struct {
		name, header, filename string
		status                 int
	}{
		{"original name", `attachment; filename="scan.DCM"`, "scan.DCM", 201},
		{"unicode", `attachment; filename*=UTF-8''%D1%81%D0%BD%D0%B8%D0%BC%D0%BE%D0%BA.dcm`, "снимок.dcm", 201},
		{"legacy", "", "", 201},
		{"invalid header", `attachment; filename="`, "", 400},
	} {
		t.Run(tc.name, func(t *testing.T) {
			log := zerolog.Nop()
			m, err := metrics.New("upload_test")
			require.NoError(t, err)
			stub := &uploadStub{}
			app := fiber.New()
			app.Use(func(c fiber.Ctx) error {
				c.Locals("tokenClaims", jwt.TokenClaims{UserID: 1, OrganizationID: 2, Role: "specialist"})
				return c.Next()
			})
			app.Post("/dicom/upload", New(&log, m, stub).Upload)
			req := httptest.NewRequest("POST", "/dicom/upload", strings.NewReader("DICOM"))
			req.Header.Set("Content-Type", "application/dicom")
			if tc.header != "" {
				req.Header.Set("Content-Disposition", tc.header)
			}
			resp, err := app.Test(req)
			require.NoError(t, err)
			defer resp.Body.Close()
			require.Equal(t, tc.status, resp.StatusCode)
			if tc.status != 201 {
				require.Empty(t, stub.request.RawDicoms)
				return
			}
			require.Equal(t, "specialist", stub.request.CreatorRole)
			require.Len(t, stub.request.RawDicoms, 1)
			file := stub.request.RawDicoms[0]
			require.Equal(t, []byte("DICOM"), file.Payload)
			if tc.filename != "" {
				require.Equal(t, tc.filename, file.FileName)
			} else {
				require.True(t, strings.HasSuffix(file.FileName, ".dcm"))
				require.Len(t, file.FileName, 40)
			}
		})
	}
}
