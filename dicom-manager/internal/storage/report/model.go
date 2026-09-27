package report

import (
	"time"
)

// Report структура для хранения информации об отчете в базе данных.
type Report struct {
	ID                int64     `db:"id"`
	DicomJobResultIDs []string  `db:"dicom_job_result_ids"`
	CreatorID         int64     `db:"creator_id"`
	CreatedAt         time.Time `db:"created_at"`
}

// DicomResult структура для хранения информации о результате обработки DICOM в базе данных.
type DicomResult struct {
	FileName         string   `db:"file_name"`
	DicomStudyUid    string   `db:"dicom_study_uid"`
	DicomImageUid    string   `db:"dicom_image_uid"`
	JobStatus        string   `db:"job_status"`
	AnatomicalRegion string   `db:"anatomical_region"`
	Confidence       float64  `db:"confidence"`
	Violations       []string `db:"violations"`
	DurationMs       int64    `db:"duration_ms"`
	Metadata         []byte   `db:"metadata"`
}
