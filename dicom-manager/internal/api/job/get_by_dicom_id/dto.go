package get_by_dicom_id

import (
	"github.com/yogenyslav/ldt-2026/dicom-manager/internal/api/job/model"
)

// GetByDicomIDOut структура ответа для получения информации о задачах на обработку DICOM-файлов для одного DICOM-файла.
type GetByDicomIDOut struct {
	Jobs []model.JobInfo `json:"jobs"` // Список информации о задачах на обработку DICOM-файлов.
}
