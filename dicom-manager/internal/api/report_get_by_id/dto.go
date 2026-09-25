package report_get_by_id

// Report структура, представляющая отчет по результатам обработки DICOM-файлов.
type Report struct {
	ID          int64  `json:"id"`           // ID отчета по результатам обработки DICOM-файлов.
	DownloadURL string `json:"download_url"` // URL для скачивания отчета по результатам обработки DICOM-файлов.
	CreatedAt   string `json:"created_at"`   // Дата и время создания отчета по результатам обработки DICOM-файлов.
}

// ReportGetByIDOut структура ответа получения отчета по результатам обработки DICOM-файлов по ID.
type ReportGetByIDOut struct {
	Reports Report `json:"report"` // Содержит отчет по результатам обработки DICOM-файлов.
}
