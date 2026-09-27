package model

import (
	"time"
)

// Report структура, представляющая отчет по результатам обработки DICOM-файлов.
type Report struct {
	ID          int64     `json:"id"`           // ID отчета по результатам обработки DICOM-файлов.
	DownloadURL string    `json:"download_url"` // URL для скачивания отчета по результатам обработки DICOM-файлов.
	CreatedAt   time.Time `json:"created_at"`   // Дата и время создания отчета по результатам обработки DICOM-файлов.
}
