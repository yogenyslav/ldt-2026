package job

import (
	"time"
)

// DicomJobResult структура для хранения информации о результате обработки DICOM файла в базе данных.
type DicomJobResult struct {
	DetectionProperties
	ResultDecision

	UploadSource string    `db:"upload_source"`
	ID           string    `db:"job_id"`
	DicomFileID  string    `db:"dicom_file_id"`
	Status       string    `db:"job_status"`
	CreatedAt    time.Time `db:"created_at"`
	UpdatedAt    time.Time `db:"updated_at"`
}

// DetectionProperties структура для хранения информации о свойствах обнаружения в результате обработки DICOM файла.
type DetectionProperties struct {
	AnatomicalRegion *string  `db:"anatomical_region"`
	Confidence       *float64 `db:"confidence"`
	Violations       []string `db:"violations"`
	DurationMs       *int64   `db:"duration_ms"`
	Metadata         []byte   `db:"metadata"`
}

// ResultDecision структура для хранения информации о решении специалиста по результату обработки DICOM файла.
type ResultDecision struct {
	SpecialistDecision *string `db:"specialist_decision"`
	SpecialistID       *int64  `db:"specialist_id"`
	Comment            *string `db:"comment"`
}

// UpdateDecisionData структура для передачи данных при обновлении решения специалиста по результату обработки DICOM файла.
type UpdateDecisionData struct {
	JobIDs             []string
	SpecialistDecision string
	Comment            string
	SpecialistID       int64
	CheckCreator       bool
}

// JobState состояние задачи для проверки входящего события.
type JobState struct {
	DicomID string `db:"dicom_file_id"`
	Status  string `db:"job_status"`
}
