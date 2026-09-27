package get_paginated

import (
	"github.com/yogenyslav/ldt-2026/dicom-manager/internal/api/report/model"
)

// GetPaginatedOut структура ответа после получения отчетов по результатам обработки DICOM-файлов.
type GetPaginatedOut struct {
	Reports []model.Report `json:"reports"` // Список отчетов по результатам обработки DICOM-файлов.
}
