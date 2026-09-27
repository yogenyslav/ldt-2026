package upload_batch

// DicomData структура для передачи данных о DICOM файле и задаче на сервере.
type DicomData struct {
	DicomID string `json:"dicom_id"`
	JobID   string `json:"job_id"` // ID задачи на сервере для обработки DICOM файла.
}

// UploadBatchOut выходные данные для загрузки DICOM файлов пакетно.
type UploadBatchOut struct {
	Data []DicomData `json:"data"` // Список данных о DICOM файлах и задачах на сервере.
}
