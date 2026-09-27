package get_paginated

import (
	"time"

	"github.com/yogenyslav/ldt-2026/dicom-manager/internal/api/user/model"
)

// GetPaginatedRequest структура запроса для получения списка отчетов с пагинацией.
type GetPaginatedRequest struct {
	RequesterID   int64
	RequesterRole model.UserRole
	Offset        uint64
	Limit         uint64
}

// ReportData структура данных отчета, возвращаемая в ответе на запрос.
type ReportData struct {
	ID           int64
	JobIDs       []string
	CreatorID    int64
	CreatedAt    time.Time
	PresignedURL string
}
