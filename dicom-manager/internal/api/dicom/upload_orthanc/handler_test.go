package upload_orthanc

import (
	"context"
	"errors"
	"io"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gofiber/fiber/v3"
	"github.com/rs/zerolog"
	storage "github.com/yogenyslav/ldt-2026/dicom-manager/internal/storage/dicom"
	"github.com/yogenyslav/ldt-2026/dicom-manager/pkg/jwt"
)

type stub struct {
	saved  storage.Dicom
	starts int
	err    error
}

func (s *stub) RegisterOrthanc(_ context.Context, file storage.Dicom) error {
	s.saved = file
	return s.err
}
func (s *stub) StartOrthanc(_ context.Context, id string, creator, organization int64) error {
	if id != s.saved.ID || creator != s.saved.CreatorID || organization != s.saved.OrganizationID {
		return errors.New("wrong start request")
	}
	s.starts++
	return nil
}

func TestOrthancRegistrationAndStart(t *testing.T) {
	const metadata = `{"dicom_id":"id","file_name":"file.dcm","series_id":"series","study_id":"study","dicom_series_uid":"series-uid","dicom_study_uid":"study-uid","dicom_image_uid":"image-uid","creator_id":999,"patient_id":"p1","patient_name":"Test^Patient","patient_birth_date":"19800102","patient_sex":"F","device_model":"Modality=DX; Manufacturer=Maker; ManufacturerModelName=Model; DeviceSerialNumber=serial; StationName=station"}`
	for _, tc := range []struct {
		name, body           string
		authorized, failSave bool
		status               int
	}{
		{"success", metadata, true, false, 201}, {"database failure", metadata, true, true, 500},
		{"missing metadata", `{"dicom_id":"id"}`, true, false, 400}, {"missing auth", metadata, false, false, 403},
	} {
		t.Run(tc.name, func(t *testing.T) {
			uc := &stub{}
			if tc.failSave {
				uc.err = errors.New("commit failed")
			}
			logger := zerolog.Nop()
			h := New(&logger, uc)
			app := fiber.New()
			app.Use(func(c fiber.Ctx) error {
				if tc.authorized {
					c.Locals("tokenClaims", jwt.TokenClaims{UserID: 42, OrganizationID: 218})
				}
				return c.Next()
			})
			app.Post("/dicom/upload/orthanc", h.Upload)
			app.Post("/dicom/upload/orthanc/:dicom_id/process", h.Start)
			req := httptest.NewRequest("POST", "/dicom/upload/orthanc", strings.NewReader(tc.body))
			req.Header.Set("Content-Type", "application/json")
			resp, err := app.Test(req)
			if err != nil {
				t.Fatal(err)
			}
			body, err := io.ReadAll(resp.Body)
			resp.Body.Close()
			if err != nil {
				t.Fatal(err)
			}
			if resp.StatusCode != tc.status {
				t.Fatalf("status=%d body=%s", resp.StatusCode, body)
			}
			if uc.starts != 0 {
				t.Fatal("processing started before registration acknowledgement")
			}
			if tc.status != 201 {
				return
			}
			if string(body) != `{"dicom_id":"id"}` || uc.saved.CreatorID != 42 || uc.saved.OrganizationID != 218 || uc.saved.DicomImageUid != "image-uid" {
				t.Fatalf("response=%s saved=%+v", body, uc.saved)
			}
			if uc.saved.PatientID != "p1" || uc.saved.DeviceModel != "Modality=DX; Manufacturer=Maker; ManufacturerModelName=Model; DeviceSerialNumber=serial; StationName=station" {
				t.Fatalf("metadata lost: %+v", uc.saved)
			}
			resp, err = app.Test(httptest.NewRequest("POST", "/dicom/upload/orthanc/id/process", nil))
			if err != nil {
				t.Fatal(err)
			}
			resp.Body.Close()
			if resp.StatusCode != 202 || uc.starts != 1 {
				t.Fatalf("status=%d starts=%d", resp.StatusCode, uc.starts)
			}
		})
	}
}
