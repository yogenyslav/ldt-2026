package generate

// GenerateReportRequest структура запроса для генерации отчета по результатам обработки DICOM-файлов.
type GenerateReportRequest struct {
	CreatorID int64
	JobIDs    []string
}
