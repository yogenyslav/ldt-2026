package upload

// UploadOut структура для ответа после загрузки DICOM файла.
type UploadOut struct {
	DicomID string `json:"dicom_id"`
	JobID   string `json:"job_id"` // ID задачи на сервере для обработки DICOM файла.
}
