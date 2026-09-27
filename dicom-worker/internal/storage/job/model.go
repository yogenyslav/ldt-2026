package job

import "time"

// Job структура задачи обработки DICOM-файла в БД.
type Job struct {
	ID        string    `db:"id"`
	DicomID   string    `db:"dicom_id"`
	Status    string    `db:"status"`
	CreatedAt time.Time `db:"created_at"`
	UpdatedAt time.Time `db:"updated_at"`
}

// DetectionProperties свойства результата анализа для сохранения в БД.
type DetectionProperties struct {
	AnatomicalRegion string
	Confidence       *float64
	Violations       []string
	DurationMs       int64
	Metadata         []byte
}
