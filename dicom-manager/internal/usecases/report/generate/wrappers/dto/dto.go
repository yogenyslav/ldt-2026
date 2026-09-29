package dto

// JobResult структура для сериализации результатов обработки DICOM-файлов в CSV-формате.
type JobResult struct {
	FileName         string   `csv:"path_to_study"`
	DicomStudyUid    string   `csv:"study_uid"`
	DicomImageUid    string   `csv:"image_uid"`
	AnatomicalRegion string   `csv:"anatomical_region"`
	QualityClass     int      `csv:"quality_class"` // 0 - качественное, 1 - есть нарушения
	Violations       []string `csv:"violation_type"`
	JobStatus        string   `csv:"processing_status"`
	DurationSec      float64  `csv:"time_of_processing"` // в секундах
}
