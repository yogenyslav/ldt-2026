package get_by_id

import (
	"time"

	"github.com/yogenyslav/ldt-2026/dicom-manager/internal/api/user/model"
)

// GetJobRequest структура запроса для получения информации о задаче на обработку DICOM-файлов по ID.
type GetJobRequest struct {
	JobID         string
	RequesterID   int64
	RequesterRole model.UserRole
}

// Job структура для хранения информации о задаче.
type Job struct {
	ID                 string
	DicomFileID        string
	Status             string
	AnatomicalRegion   *string
	Confidence         *float64
	Violations         []string
	DurationMs         *int64
	Metadata           []byte
	SpecialistDecision *string
	SpecialistID       *int64
	Comment            *string
	CreatedAt          time.Time
	UpdatedAt          time.Time
}
