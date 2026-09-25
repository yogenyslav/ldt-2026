package dicom_get_image

import (
	"uuid"
)

// DicomGetImageIn входные данные для получения изображения DICOM.
type DicomGetImageIn struct {
	DicomID uuid.UUID `json:"dicom_id"`
	Raw     *bool     `json:"raw,omitempty"` // С этим флагом будут возвращаться байты, без него - base64.
}

// DicomGetImageOut выходные данные для получения изображения DICOM.
//
//	@Description	Если Raw=false, то возвращается base64 изображения. Если Raw=true, то возвращаются байты изображения.
type DicomGetImageOut struct {
	ImageData    string `json:"image_data,omitempty"`     // Если Raw=false, то возвращается base64 изображения.
	ImageDataRaw []byte `json:"image_data_raw,omitempty"` // Если Raw=true, то возвращаются байты изображения.
}
