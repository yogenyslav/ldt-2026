package filestorage

import (
	"context"
	"net/url"
	"testing"
	"time"

	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
	"github.com/stretchr/testify/require"
)

func TestPresignedGetObject(t *testing.T) {
	client, err := minio.New("reports:9000", &minio.Options{
		Creds:        credentials.NewStaticV4("test-access", "test-secret", ""),
		Region:       "us-east-1",
		BucketLookup: minio.BucketLookupPath,
	})
	require.NoError(t, err)

	for _, tc := range []struct {
		name, prefix, scheme, host, path string
	}{
		{"direct", "", "http", "reports:9000", "/reports/folder/report +%.csv"},
		{"proxy", "/report-files", "", "", "/report-files/reports/folder/report +%.csv"},
		{"trailing slash", "/report-files/", "", "", "/report-files/reports/folder/report +%.csv"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			storage := &S3{cfg: Config{DownloadProxyPath: tc.prefix}, conn: client}
			link, err := storage.PresignedGetObject(context.Background(), "reports", "folder/report +%.csv", 15*time.Minute)
			require.NoError(t, err)
			u, err := url.Parse(link)
			require.NoError(t, err)
			require.Equal(t, tc.scheme, u.Scheme)
			require.Equal(t, tc.host, u.Host)
			require.Equal(t, tc.path, u.Path)
			require.Contains(t, u.EscapedPath(), "report%20%2B%25.csv")
			require.Equal(t, "900", u.Query().Get("X-Amz-Expires"))
			require.Equal(t, "host", u.Query().Get("X-Amz-SignedHeaders"))
			require.NotEmpty(t, u.Query().Get("X-Amz-Signature"))
		})
	}
}
