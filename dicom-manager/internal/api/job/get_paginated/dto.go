package get_paginated

import (
	"github.com/yogenyslav/ldt-2026/dicom-manager/internal/api/job/model"
)

// GetInfoPaginatedOut структура ответа для получения информации о задачах на обработку DICOM-файлов с пагинацией.
type GetInfoPaginatedOut struct {
	Jobs []model.JobInfo `json:"jobs"` // Список информации о задачах на обработку DICOM-файлов.
}
