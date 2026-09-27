package wrappers

import (
	"context"
	"fmt"
	"io"

	"github.com/yogenyslav/ldt-2026/dicom-manager/internal/generated/orthanc"
)

// Orthanc структура для работы с Orthanc API.
type Orthanc struct {
	client orthanc.ClientInterface
}

// NewOrthanc создает новый экземпляр Orthanc с указанным клиентом Orthanc API.
func NewOrthanc(client orthanc.ClientInterface) *Orthanc {
	return &Orthanc{
		client: client,
	}
}

// GetImageByID получает изображение по его ID из Orthanc.
func (o *Orthanc) GetImageByID(ctx context.Context, dicomID string) ([]byte, error) {
	resp, err := o.client.GetInstancesIdPreview(ctx, dicomID, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to call orthanc API: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("orthanc API returned code %d", resp.StatusCode)
	}

	dicomPreview, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response body: %w", err)
	}

	return dicomPreview, nil
}
