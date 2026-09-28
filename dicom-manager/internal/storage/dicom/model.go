package dicom

import (
	"time"
)

// Dicom структура для хранения информации о DICOM файле в БД.
type Dicom struct {
	ID             string    `db:"id"`
	FileName       string    `db:"file_name"`
	SeriesID       string    `db:"series_id"`        // Поле из Orthanc.
	StudyID        string    `db:"study_id"`         // Поле из Orthanc.
	DicomSeriesUid string    `db:"dicom_series_uid"` // Внутреннее поле из DICOM файла.
	DicomStudyUid  string    `db:"dicom_study_uid"`  // Внутреннее поле из DICOM файла.
	DicomImageUid  string    `db:"dicom_image_uid"`  // Внутреннее поле из DICOM файла.
	CreatorID      int64     `db:"creator_id"`
	OrganizationID int64     `db:"organization_id"`
	DeviceModel    string    `db:"device_model"`
	PatientID      string    `db:"patient_id"`
	CreatedAt      time.Time `db:"created_at"`
}
