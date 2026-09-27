package upload

// RawDicomData структура для загрузки необработанных данных DICOM-файла.
type RawDicomData struct {
	Payload    []byte
	FileName   string
	InstanceID string
}

// DicomUploadRequest структура для передачи данных при загрузке DICOM-файла.
type DicomUploadRequest struct {
	RawDicoms      []RawDicomData
	CreatorID      int64
	OrganizationID int64
	SyncOrthanc    bool
}
