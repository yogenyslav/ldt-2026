package job_info_get_by_id

import (
	"github.com/yogenyslav/ldt-2026/dicom-manager/internal/api/model"
)

// JobInfoGetByIDOut структура ответа для получения информации о задаче на обработку DICOM-файлов по ID.
type JobInfoGetByIDOut struct {
	Job model.JobInfo `json:"job"` // Содержит информацию о задаче на обработку DICOM-файлоа.
}
