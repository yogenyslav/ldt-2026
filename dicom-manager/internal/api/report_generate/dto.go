package report_generate

// ReportGenerateIn структура запроса для генерации отчета по результатам обработки DICOM-файлов.
type ReportGenerateIn struct {
	JobIDs []string `json:"job_ids"` // Список ID задач на обработку DICOM-файлов, для которых необходимо сгенерировать отчет.
}

// ReportGenerateOut структура ответа после генерации отчета по результатам обработки DICOM-файлов.
type ReportGenerateOut struct {
	ReportID int64 `json:"report_id"` // ID сгенерированного отчета по результатам обработки DICOM-файлов.
}
