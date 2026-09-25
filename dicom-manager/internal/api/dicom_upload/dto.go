package dicom_upload

import (
	"uuid"
)

// DicomUploadOut структура для ответа после загрузки DICOM файла.
type DicomUploadOut struct {
	DicomID uuid.UUID `json:"dicom_id"`
	JobID   uuid.UUID `json:"job_id"` // ID задачи на сервере для обработки DICOM файла.
}
