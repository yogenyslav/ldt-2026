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
