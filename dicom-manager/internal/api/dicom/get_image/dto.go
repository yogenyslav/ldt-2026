package get_image

// GetImageOut выходные данные для получения изображения DICOM.
type GetImageOut struct {
	ImageData    string `json:"image_data,omitempty"`                                        // Если Raw=false, то возвращается base64 изображения.
	ImageDataRaw []byte `json:"image_data_raw,omitempty" swaggertype:"string" format:"byte"` // Если Raw=true, байты изображения сериализуются в JSON как base64.
}
