package get_by_ids

import "time"

// Job информация о задаче обработки DICOM-файла.
type Job struct {
	ID        string
	DicomID   string
	Status    string
	CreatedAt time.Time
	UpdatedAt time.Time
}
