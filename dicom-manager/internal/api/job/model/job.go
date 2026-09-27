package model

import (
	"time"
)

// JobStatus статус задачи на обработку DICOM-файла.
type JobStatus string

const (
	JobStatusPending    JobStatus = "pending"    // Задача ожидает обработки.
	JobStatusProcessing JobStatus = "processing" // Задача в процессе обработки.
	JobStatusCompleted  JobStatus = "completed"  // Задача успешно завершена.
	JobStatusFailed     JobStatus = "failed"     // Задача завершилась с ошибкой.
)

// JobInfo структура, содержащая информацию о задаче на обработку DICOM-файла.
type JobInfo struct {
	ID                 string         `json:"id"`                            // ID задачи на обработку.
	DicomID            string         `json:"dicom_id"`                      // ID DICOM-файла.
	Status             JobStatus      `json:"status"`                        // Статус задачи на обработку.
	AnatomicalRegion   *string        `json:"anatomical_region,omitempty"`   // Анатомическая область, к которой относится DICOM-файл.
	Confidence         *float64       `json:"confidence,omitempty"`          // Уровень уверенности в результатах обработки от 0 до 1.
	Violations         []string       `json:"violations,omitempty"`          // Список нарушений, обнаруженных в DICOM-файле.
	DurationMs         *int64         `json:"duration_ms,omitempty"`         // Время обработки задачи в миллисекундах.
	Metadata           map[string]any `json:"metadata,omitempty"`            // Дополнительные метаданные, связанные с задачей.
	SpecialistID       *int64         `json:"specialist_id,omitempty"`       // ID специалиста, который принял решение.
	SpecialistDecision *Decision      `json:"specialist_decision,omitempty"` // Решение специалиста по результату задачи.
	Comment            *string        `json:"comment,omitempty"`             // Комментарий специалиста.
	CreatedAt          time.Time      `json:"created_at"`
	UpdatedAt          time.Time      `json:"updated_at"`
}
