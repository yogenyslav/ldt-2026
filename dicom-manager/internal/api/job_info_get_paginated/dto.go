package job_info_get_by_ids

import (
	"github.com/yogenyslav/ldt-2026/dicom-manager/internal/api/model"
)

// JobInfoGetPaginatedOut структура ответа для получения информации о задачах на обработку DICOM-файлов с пагинацией.
type JobInfoGetPaginatedOut struct {
	Jobs []model.JobInfo `json:"jobs"` // Список информации о задачах на обработку DICOM-файлов.
}
