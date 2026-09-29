package query

import (
	"net/http/httptest"
	"testing"

	"github.com/gofiber/fiber/v3"
	"github.com/stretchr/testify/require"
)

func TestUploadSourceFilter(t *testing.T) {
	for _, tc := range []struct {
		query  string
		want   []string
		status int
	}{
		{"clinic", []string{"clinic"}, 200},
		{"manual", []string{"manual"}, 200},
		{"manual,clinic,clinic", []string{"manual", "clinic"}, 200},
		{"orthanc", nil, 400},
		{"clinic,orthanc", nil, 400},
		{"clinic,", nil, 400},
	} {
		t.Run(tc.query, func(t *testing.T) {
			app := fiber.New()
			app.Get("/", func(c fiber.Ctx) error {
				_, sources, err := ParseFilters(c)
				if err != nil {
					return err
				}
				require.Equal(t, tc.want, sources)
				return c.SendStatus(200)
			})
			resp, err := app.Test(httptest.NewRequest("GET", "/?upload_source="+tc.query, nil))
			require.NoError(t, err)
			defer resp.Body.Close()
			require.Equal(t, tc.status, resp.StatusCode)
		})
	}
}
