package orthanc

import (
	"context"
	"errors"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
	"github.com/yogenyslav/ldt-2026/dicom-manager/internal/usecases/dicom/upload/wrappers"
)

type doerFunc func(*http.Request) (*http.Response, error)

func (f doerFunc) Do(req *http.Request) (*http.Response, error) { return f(req) }

type trackedBody struct {
	io.Reader
	closed bool
}

func (b *trackedBody) Close() error {
	b.closed = true
	return nil
}

func TestRetryClient(t *testing.T) {
	t.Parallel()
	networkErr := errors.New("connection reset")
	for _, tc := range []struct {
		name       string
		method     string
		status     int
		err        error
		persistent bool
		attempts   int
	}{
		{name: "not found then ready", method: "GET", status: 404, attempts: 2},
		{name: "timeout", method: "GET", status: 408, attempts: 2},
		{name: "rate limit", method: "GET", status: 429, attempts: 2},
		{name: "unavailable", method: "HEAD", status: 503, attempts: 2},
		{name: "network error", method: "GET", err: networkErr, attempts: 2},
		{name: "exhausted", method: "GET", status: 404, persistent: true, attempts: 5},
		{name: "network exhausted", method: "GET", err: networkErr, persistent: true, attempts: 5},
		{name: "bad request", method: "GET", status: 400, attempts: 1},
		{name: "unauthorized", method: "GET", status: 401, attempts: 1},
		{name: "forbidden", method: "GET", status: 403, attempts: 1},
		{name: "upload", method: "POST", status: 503, attempts: 1},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			attempts := 0
			var bodies []*trackedBody
			client := retryClient{client: doerFunc(func(req *http.Request) (*http.Response, error) {
				attempts++
				for _, body := range bodies {
					require.True(t, body.closed, "previous response must be closed before retry")
				}
				status := http.StatusOK
				if attempts == 1 || tc.persistent {
					if tc.err != nil {
						return nil, tc.err
					}
					status = tc.status
				}
				body := &trackedBody{Reader: strings.NewReader("response")}
				bodies = append(bodies, body)
				return &http.Response{StatusCode: status, Body: body}, nil
			})}
			req, err := http.NewRequestWithContext(context.Background(), tc.method, "http://orthanc/instances/id", nil)
			require.NoError(t, err)
			resp, err := client.Do(req)
			require.Equal(t, tc.attempts, attempts)
			if tc.persistent && tc.err != nil {
				require.ErrorIs(t, err, tc.err)
				return
			}
			require.NoError(t, err)
			defer resp.Body.Close()
			wantStatus := http.StatusOK
			if tc.persistent || tc.attempts == 1 {
				wantStatus = tc.status
			}
			require.Equal(t, wantStatus, resp.StatusCode)
			require.False(t, bodies[len(bodies)-1].closed, "caller owns final response")
		})
	}
}

func TestRetryClientCancellation(t *testing.T) {
	t.Parallel()
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	attempts := 0
	body := &trackedBody{Reader: strings.NewReader("not found")}
	client := retryClient{client: doerFunc(func(req *http.Request) (*http.Response, error) {
		attempts++
		cancel()
		return &http.Response{StatusCode: 404, Body: body}, nil
	})}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, "http://orthanc/instances/id", nil)
	require.NoError(t, err)
	_, err = client.Do(req)
	require.ErrorIs(t, err, context.Canceled)
	require.Equal(t, 1, attempts)
	require.True(t, body.closed)

	_, err = client.Do(req)
	require.ErrorIs(t, err, context.Canceled)
	require.Equal(t, 1, attempts, "canceled request must not be sent")
}

func TestNewRetriesRelatedEntities(t *testing.T) {
	calls := make(map[string]int)
	responses := map[string]string{
		"/instances/instance/simplified-tags": `{"PatientID":"patient", "Manufacturer":"manufacturer"}`,
		"/instances/instance":                 `{"ID":"instance","ParentSeries":"series","MainDicomTags":{"SOPInstanceUID":"image-uid"}}`,
		"/series/series":                      `{"ID":"series","ParentStudy":"study","MainDicomTags":{"SeriesInstanceUID":"series-uid"}}`,
		"/studies/study":                      `{"MainDicomTags":{"StudyInstanceUID":"study-uid"}}`,
	}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, ok := responses[r.URL.Path]
		if !ok {
			t.Errorf("unexpected request: %s", r.URL.Path)
			http.Error(w, "unexpected path", http.StatusBadRequest)
			return
		}
		if user, password, ok := r.BasicAuth(); !ok || user != "user" || password != "password" {
			t.Error("missing authorization")
		}
		calls[r.URL.Path]++
		if calls[r.URL.Path] == 1 {
			http.NotFound(w, r)
			return
		}
		_, _ = io.WriteString(w, body)
	}))
	defer server.Close()
	host, port, err := net.SplitHostPort(server.Listener.Addr().String())
	require.NoError(t, err)
	t.Setenv("ORTHANC_HOST", host)
	t.Setenv("ORTHANC_PORT", port)
	t.Setenv("ORTHANC_NAME", "user")
	t.Setenv("ORTHANC_PASSWORD", "password")
	t.Setenv("ORTHANC_TOKEN", "")
	client, err := New()
	require.NoError(t, err)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	props, err := wrappers.NewOrthanc(client.Client()).GetDicomProperties(ctx, "instance")
	require.NoError(t, err)
	require.Equal(t, "patient", props.PatientID)
	require.Equal(t, "Manufacturer=manufacturer", props.DeviceModel)
	require.Equal(t, "series", props.ParentSeries)
	require.Equal(t, "study", props.ParentStudy)
	require.Equal(t, "image-uid", props.DicomImageUid)
	require.Equal(t, "series-uid", props.DicomSeriesUid)
	require.Equal(t, "study-uid", props.DicomStudyUid)
	for path := range responses {
		require.Equal(t, 2, calls[path], path)
	}
}
