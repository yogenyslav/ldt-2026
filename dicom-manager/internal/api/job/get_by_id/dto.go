package get_by_id

import (
	"github.com/yogenyslav/ldt-2026/dicom-manager/internal/api/job/model"
)

// GetByIDOut структура ответа для получения информации о задаче на обработку DICOM-файлов по ID.
type GetByIDOut struct {
	Job model.JobInfo `json:"job"` // Содержит информацию о задаче на обработку DICOM-файлоа.
}
