package dto

// OrthancDicomProperties структура для представления свойств DICOM в Orthanc.
type OrthancDicomProperties struct {
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
