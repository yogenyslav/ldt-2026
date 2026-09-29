package get_by_id

import (
	"time"
)

// GetByIDOut содержит все поля dicom_file, кроме updated_at.
type GetByIDOut struct {
	UploadSource   string    `json:"upload_source" enums:"unknown,manual,orthanc"`
	ID             string    `json:"id"`
	FileName       string    `json:"file_name"`
	SeriesID       string    `json:"series_id"`        // Поле из Orthanc.
	StudyID        string    `json:"study_id"`         // Поле из Orthanc.
	DicomSeriesUid string    `json:"dicom_series_uid"` // Внутреннее поле из DICOM файла.
	DicomStudyUid  string    `json:"dicom_study_uid"`  // Внутреннее поле из DICOM файла.
	DicomImageUid  string    `json:"dicom_image_uid"`  // Внутреннее поле из DICOM файла.
	CreatorID      int64     `json:"creator_id"`
	OrganizationID int64     `json:"organization_id"`
	DeviceModel    string    `json:"device_model"`
	PatientID      string    `json:"patient_id"`
	CreatedAt      time.Time `json:"created_at"`
}
