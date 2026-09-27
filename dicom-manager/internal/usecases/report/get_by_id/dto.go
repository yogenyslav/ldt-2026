package get_by_id

import (
	"time"

	"github.com/yogenyslav/ldt-2026/dicom-manager/internal/api/user/model"
)

// GetReportRequest структура запроса для получения отчета по его ID.
type GetReportRequest struct {
	ReportID      int64
	RequesterID   int64
	RequesterRole model.UserRole
}

// ReportData структура данных отчета, возвращаемая в ответе на запрос.
type ReportData struct {
	ID           int64
	JobIDs       []string
	CreatorID    int64
	CreatedAt    time.Time
	PresignedURL string
}
