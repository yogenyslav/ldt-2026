package wrappers

import (
	"context"
	"errors"
	"io"
	"net/http"
	"strings"
	"testing"

	"github.com/yogenyslav/ldt-2026/dicom-manager/internal/generated/orthanc"
)

type httpStub func(*http.Request) (*http.Response, error)

func (f httpStub) Do(r *http.Request) (*http.Response, error) { return f(r) }
func response(code int, body string) *http.Response {
	return &http.Response{StatusCode: code, Body: io.NopCloser(strings.NewReader(body))}
}
func TestUploadRetainsCreatedIDsOnFailure(t *testing.T) {
	for _, status := range []string{"AlreadyStored", "Failure"} {
		t.Run(status, func(t *testing.T) {
			client, err := orthanc.NewClient("http://orthanc", orthanc.WithHTTPClient(httpStub(func(r *http.Request) (*http.Response, error) {
				if r.Method == http.MethodPost {
					return response(200, `[{"ID":"new","Status":"Success"},{"ID":"old","Status":"`+status+`"},{"ID":"new2","Status":"Success"}]`), nil
				}
				return response(500, ""), nil
			})))
			if err != nil {
				t.Fatal(err)
			}
			props, err := NewOrthanc(client).UploadInstances(context.Background(), nil)
			if err == nil || len(props) != 3 {
				t.Fatalf("props=%v err=%v", props, err)
			}
			if props[0].ID != "new" || !props[0].Created || props[1].Created || props[2].ID != "new2" || !props[2].Created {
				t.Fatalf("upload ownership lost: %+v", props)
			}
		})
	}
}
func TestUploadAlreadyStored(t *testing.T) {
	client, err := orthanc.NewClient("http://orthanc", orthanc.WithHTTPClient(httpStub(func(r *http.Request) (*http.Response, error) {
		if r.Method == http.MethodPost {
			return response(200, `{"ID":"old","Status":"AlreadyStored"}`), nil
		}
		return response(200, `{"ParentSeries":"series","ParentStudy":"study","MainDicomTags":{}}`), nil
	})))
	if err != nil {
		t.Fatal(err)
	}
	props, err := NewOrthanc(client).UploadInstances(context.Background(), nil)
	if err != nil || len(props) != 1 || props[0].Created || props[0].ID != "old" {
		t.Fatalf("props=%v err=%v", props, err)
	}
}
func TestDeleteInstancesContinuesAfterErrors(t *testing.T) {
	transportErr := errors.New("transport failed")
	var calls []string
	client, err := orthanc.NewClient("http://orthanc", orthanc.WithHTTPClient(httpStub(func(r *http.Request) (*http.Response, error) {
		if r.Method != http.MethodDelete {
			t.Fatalf("unexpected method %s", r.Method)
		}
		calls = append(calls, r.URL.Path)
		switch r.URL.Path {
		case "/instances/transport":
			return nil, transportErr
		case "/instances/failure":
			return response(500, ""), nil
		case "/instances/missing":
			return response(404, ""), nil
		default:
			return response(200, ""), nil
		}
	})))
	if err != nil {
		t.Fatal(err)
	}
	o := NewOrthanc(client)
	err = o.DeleteInstances(context.Background(), []string{"transport", "failure", "missing", "ok"})
	if !errors.Is(err, transportErr) || !strings.Contains(err.Error(), "failure") || len(calls) != 4 {
		t.Fatalf("calls=%v err=%v", calls, err)
	}
	if err := o.DeleteInstances(context.Background(), []string{"missing", "ok"}); err != nil {
		t.Fatal(err)
	}
}

func TestGetDicomPropertiesMetadata(t *testing.T) {
	for _, tc := range []struct {
		name, body string
		status     int
		wantErr    bool
	}{
		{"all tags", `{"PatientID":"p1","PatientName":"Test^Patient","PatientBirthDate":"19800102","PatientSex":"F","Modality":"DX","Manufacturer":"Maker","ManufacturerModelName":"Model","DeviceSerialNumber":"serial","StationName":"station"}`, 200, false},
		{"missing tags", `{}`, 200, false},
		{"server error", `{}`, 500, true},
		{"invalid JSON", `{`, 200, true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			client, err := orthanc.NewClient("http://orthanc", orthanc.WithHTTPClient(httpStub(func(r *http.Request) (*http.Response, error) {
				switch r.URL.Path {
				case "/instances/id":
					return response(200, `{"FileUuid":"file","ParentSeries":"series","MainDicomTags":{"SOPInstanceUID":"image-uid"}}`), nil
				case "/series/series":
					return response(200, `{"ParentStudy":"study","MainDicomTags":{"SeriesInstanceUID":"series-uid"}}`), nil
				case "/studies/study":
					return response(200, `{"MainDicomTags":{"StudyInstanceUID":"study-uid"}}`), nil
				case "/instances/id/simplified-tags":
					return response(tc.status, tc.body), nil
				default:
					t.Errorf("unexpected path %s", r.URL.Path)
					return response(404, ""), nil
				}
			})))
			if err != nil {
				t.Fatal(err)
			}
			props, err := NewOrthanc(client).GetDicomProperties(context.Background(), "id")
			if (err != nil) != tc.wantErr {
				t.Fatalf("error=%v", err)
			}
			if tc.wantErr {
				return
			}
			if props.DicomImageUid != "image-uid" || props.ParentStudy != "study" {
				t.Fatalf("lost existing metadata: %+v", props)
			}
			if tc.name == "all tags" && (props.PatientID != "p1" || props.DeviceModel != "Modality=DX; Manufacturer=Maker; ManufacturerModelName=Model; DeviceSerialNumber=serial; StationName=station") {
				t.Fatalf("metadata=%+v", props)
			}
			if tc.name == "missing tags" && (props.PatientID != "" || props.DeviceModel != "") {
				t.Fatalf("metadata=%+v", props)
			}
		})
	}
}
