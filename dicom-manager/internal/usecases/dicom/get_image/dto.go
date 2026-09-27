package get_image

import (
	"github.com/yogenyslav/ldt-2026/dicom-manager/internal/api/user/model"
)

// GetImageRequest структура для передачи данных при запросе изображения DICOM.
type GetImageRequest struct {
	DicomID       string
	WithRaw       bool
	RequesterID   int64
	RequesterRole model.UserRole
}

// ImageData структура для хранения данных изображения DICOM.
type ImageData struct {
	DataBase64 string
	DataRaw    []byte
}
