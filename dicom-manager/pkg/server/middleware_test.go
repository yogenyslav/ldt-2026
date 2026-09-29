package server

import (
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gofiber/fiber/v3"
	"github.com/yogenyslav/ldt-2026/dicom-manager/pkg/observability/metrics"
)

func TestMetricsMiddlewareRouteCardinality(t *testing.T) {
	for _, tc := range []struct {
		name, route, metricPath, outcome string
		urls                             []string
		status                           int
		blocked                          bool
	}{
		{"path and query parameters", "/jobs/:id", "/jobs/:id", "ok", []string{"/jobs/123?limit=1", "/jobs/456?limit=20"}, 200, false},
		{"wildcard", "/files/*", "/files/*", "ok", []string{"/files/a/b", "/files/c/d?download=1"}, 200, false},
		{"static route", "/jobs", "/jobs", "ok", []string{"/jobs?page=1", "/jobs?page=2"}, 200, false},
		{"handler error", "/jobs/:id", "/jobs/:id", "error", []string{"/jobs/123", "/jobs/456"}, 404, false},
		{"unknown route", "/jobs/:id", "unmatched", "error", []string{"/missing/123", "/unknown/456?q=1"}, 404, false},
		{"rejected before routing", "/jobs/:id", "unmatched", "error", []string{"/jobs/123", "/jobs/456"}, 401, true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			m, err := metrics.New("test")
			if err != nil {
				t.Fatal(err)
			}
			app := fiber.New()
			app.Use(MetricsMiddleware(m))
			if tc.blocked {
				app.Use(func(c fiber.Ctx) error { return fiber.ErrUnauthorized })
			}
			app.Get(tc.route, func(c fiber.Ctx) error {
				if tc.status == 404 {
					return fiber.ErrNotFound
				}
				return c.SendStatus(fiber.StatusOK)
			})
			for _, url := range tc.urls {
				res, err := app.Test(httptest.NewRequest("GET", url, nil))
				if err != nil {
					t.Fatal(err)
				}
				res.Body.Close()
				if res.StatusCode != tc.status {
					t.Fatalf("status: got %d, want %d", res.StatusCode, tc.status)
				}
			}
			families, err := m.Registry().Gather()
			if err != nil {
				t.Fatal(err)
			}
			prefix := "test_http.requests.GET_" + tc.metricPath + "."
			want := map[string]bool{prefix + "total": true, prefix + tc.outcome: true, prefix + "response_time": true}
			for _, family := range families {
				name := family.GetName()
				if !strings.HasPrefix(name, "test_http.requests.") {
					continue
				}
				if !want[name] {
					t.Fatalf("unexpected metric: %s", name)
				}
				delete(want, name)
				if len(family.Metric) != 1 {
					t.Fatalf("expected one series for %s", name)
				}
				if !strings.HasSuffix(name, ".response_time") && family.Metric[0].GetCounter().GetValue() != float64(len(tc.urls)) {
					t.Fatalf("requests were not aggregated: %s", name)
				}
			}
			if len(want) != 0 {
				t.Fatalf("missing metrics: %v", want)
			}
		})
	}
}
