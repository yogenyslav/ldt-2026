package dicom_upload_batch

import (
	"uuid"
)

// DicomData структура для передачи данных о DICOM файле и задаче на сервере.
type DicomData struct {
	DicomID uuid.UUID `json:"dicom_id"`
	JobID   uuid.UUID `json:"job_id"` // ID задачи на сервере для обработки DICOM файла.
}

// DicomUploadBatchOut выходные данные для загрузки DICOM файлов пакетно.
type DicomUploadBatchOut struct {
	Data []DicomData `json:"data"` // Список данных о DICOM файлах и задачах на сервере.
}
