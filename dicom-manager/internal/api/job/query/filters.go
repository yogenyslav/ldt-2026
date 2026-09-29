package query

import (
	"strconv"
	"strings"

	"github.com/gofiber/fiber/v3"
	"github.com/yogenyslav/ldt-2026/dicom-manager/internal/storage/dicom"
)

// ParseFilters читает общие фильтры ручек получения задач.
func ParseFilters(c fiber.Ctx) ([]int64, []string, error) {
	var sources []string
	seenSources := make(map[string]bool)
	if raw := c.Query("upload_source"); raw != "" {
		for _, part := range strings.Split(raw, ",") {
			source := strings.TrimSpace(part)
			if source != dicom.UploadSourceManual && source != dicom.UploadSourceClinic {
				return nil, nil, fiber.NewError(fiber.StatusBadRequest, "upload_source must contain manual or clinic values separated by commas")
			}
			if !seenSources[source] {
				sources = append(sources, source)
				seenSources[source] = true
			}
		}
	}

	var ids []int64
	seen := make(map[int64]bool)
	raw := c.Query("organization_ids")

	if raw != "" {
		for _, part := range strings.Split(raw, ",") {
			id, err := strconv.ParseInt(strings.TrimSpace(part), 10, 64)
			if err != nil || id <= 0 {
				return nil, nil, fiber.NewError(fiber.StatusBadRequest, "organization_ids must contain positive integer IDs separated by commas")
			}
			if !seen[id] {
				ids = append(ids, id)
				seen[id] = true
			}
		}
	}

	return ids, sources, nil
}
