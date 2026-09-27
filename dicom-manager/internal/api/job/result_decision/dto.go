package result_decision

import (
	"github.com/yogenyslav/ldt-2026/dicom-manager/internal/api/job/model"
)

// ResultDecisionIn структура запроса для смены решения по результатам обработки DICOM-файлов.
type ResultDecisionIn struct {
	JobIDs   []string       `json:"job_ids"`           // Список ID задач на обработку DICOM-файлов, для которых необходимо принять решение по результатам.
	Decision model.Decision `json:"decision"`          // Решение по результатам обработки DICOM-файлов ("approved", "rejected", "force_approved").
	Comment  *string        `json:"comment,omitempty"` // Комментарий к решению по результатам обработки DICOM-файлов (необязательный).
}
