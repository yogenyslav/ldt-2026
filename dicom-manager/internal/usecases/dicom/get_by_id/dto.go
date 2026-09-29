package get_by_id

import (
	"github.com/yogenyslav/ldt-2026/dicom-manager/internal/api/user/model"
)

// GetDicomRequest структура для передачи данных при запросе DICOM-файла.
type GetDicomRequest struct {
	DicomID       string
	RequesterID   int64
	RequesterRole model.UserRole
}
