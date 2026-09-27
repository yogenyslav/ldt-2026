package generate

// GenerateIn структура запроса для генерации отчета по результатам обработки DICOM-файлов.
type GenerateIn struct {
	JobIDs []string `json:"job_ids"` // Список ID задач на обработку DICOM-файлов, для которых необходимо сгенерировать отчет.
}

// GenerateOut структура ответа после генерации отчета по результатам обработки DICOM-файлов.
type GenerateOut struct {
	ReportID int64 `json:"report_id"` // ID сгенерированного отчета по результатам обработки DICOM-файлов.
}
