package get_by_id

import (
	"github.com/yogenyslav/ldt-2026/dicom-manager/internal/api/report/model"
)

// GetByIDOut структура ответа получения отчета по результатам обработки DICOM-файлов по ID.
type GetByIDOut struct {
	Report model.Report `json:"report"` // Содержит отчет по результатам обработки DICOM-файлов.
}
