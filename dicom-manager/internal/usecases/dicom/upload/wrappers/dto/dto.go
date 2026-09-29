package dto

import "strings"

// OrthancDicomProperties структура для представления свойств DICOM в Orthanc.
type OrthancDicomProperties struct {
	DeviceModel string
	PatientID   string
	// Created равен true только для экземпляров, созданных текущей загрузкой.
	Created        bool
	ID             string
	ParentStudy    string
	ParentSeries   string
	FileName       string
	DicomStudyUid  string
	DicomSeriesUid string
	DicomImageUid  string
}

// OrthancNewDicom структура для представления загруженного экземпляра DICOM в Orthanc.
type OrthancNewDicom struct {
	ID           string `json:"ID"`
	ParentStudy  string `json:"ParentStudy"`
	ParentSeries string `json:"ParentSeries"`
	Status       string `json:"Status"`
}

// MainDicomTags структура для представления основных тегов DICOM.
type MainDicomTags struct {
	SOPInstanceUID string `json:"SOPInstanceUID"`
}

// MainStudyTags структура для представления тегов исследования DICOM.
type MainStudyTags struct {
	DicomStudyUid string `json:"StudyInstanceUID"`
}

// MainSeriesTags структура для представления тегов серии DICOM.
type MainSeriesTags struct {
	DicomSeriesUid string `json:"SeriesInstanceUID"`
}

// OrthancDicom структура для представления ответа после загрузки DICOM в Orthanc.
type OrthancDicom struct {
	ID           string        `json:"ID"`
	FileUuid     string        `json:"FileUuid"`
	ParentSeries string        `json:"ParentSeries"`
	Tags         MainDicomTags `json:"MainDicomTags"`
}

// OrthancSeries структура для представления исследования в Orthanc.
type OrthancSeries struct {
	ID          string         `json:"ID"`
	ParentStudy string         `json:"ParentStudy"`
	Tags        MainSeriesTags `json:"MainDicomTags"`
}

// OrthancStudy структура для представления исследования в Orthanc.
type OrthancStudy struct {
	Tags MainStudyTags `json:"MainDicomTags"`
}

// InstanceMetadata содержит теги пациента и аппарата из simplified-tags.
type InstanceMetadata struct {
	PatientID             string `json:"PatientID"`
	Modality              string `json:"Modality"`
	Manufacturer          string `json:"Manufacturer"`
	ManufacturerModelName string `json:"ManufacturerModelName"`
	DeviceSerialNumber    string `json:"DeviceSerialNumber"`
	StationName           string `json:"StationName"`
}

// DeviceModel объединяет непустые теги аппарата в стабильном порядке.
func (m InstanceMetadata) DeviceModel() string {
	fields := []struct{ key, value string }{
		{"Modality", m.Modality},
		{"Manufacturer", m.Manufacturer},
		{"ManufacturerModelName", m.ManufacturerModelName},
		{"DeviceSerialNumber", m.DeviceSerialNumber},
		{"StationName", m.StationName},
	}
	parts := make([]string, 0, len(fields))
	for _, field := range fields {
		if field.value != "" {
			parts = append(parts, field.key+"="+field.value)
		}
	}
	return strings.Join(parts, "; ")
}
