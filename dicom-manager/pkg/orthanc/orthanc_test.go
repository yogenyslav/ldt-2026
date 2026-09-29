package orthanc

import (
	"context"
	"encoding/base64"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestUploadUsesManagerIdentity(t *testing.T) {
	for _, tc := range []struct{ name, token string }{
		{"without token", ""},
		{"external uploader token", base64.StdEncoding.EncodeToString([]byte("dicom-orthanc:password"))},
		{"invalid legacy token", "legacy-token"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			calls := 0
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				calls++
				user, password, ok := r.BasicAuth()
				if !ok || user != "dicom-manager" || password != "password" {
					t.Error("upload must use the identity skipped by autoroute.lua")
				}
				if r.Method != http.MethodPost || r.URL.Path != "/instances" {
					t.Errorf("unexpected request: %s %s", r.Method, r.URL.Path)
				}
				_, _ = io.WriteString(w, `[]`)
			}))
			defer server.Close()
			host, port, err := net.SplitHostPort(server.Listener.Addr().String())
			require.NoError(t, err)
			t.Setenv("ORTHANC_HOST", host)
			t.Setenv("ORTHANC_PORT", port)
			t.Setenv("ORTHANC_NAME", "dicom-orthanc")
			t.Setenv("ORTHANC_PASSWORD", "password")
			t.Setenv("ORTHANC_TOKEN", tc.token)
			client, err := New()
			require.NoError(t, err)
			resp, err := client.Client().PostInstancesWithBody(context.Background(), "application/zip", strings.NewReader("dicom archive"))
			require.NoError(t, err)
			defer resp.Body.Close()
			require.Equal(t, http.StatusOK, resp.StatusCode)
			require.Equal(t, 1, calls)
		})
	}
}
