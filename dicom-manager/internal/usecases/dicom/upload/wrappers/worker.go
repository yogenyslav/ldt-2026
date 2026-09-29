package wrappers

import (
	"context"
	"fmt"
	"uuid"

	dicom_worker "github.com/yogenyslav/ldt-2026/dicom-manager/internal/generated/dicom-worker"
)

// Worker структура для работы с задачами загрузки DICOM-файлов.
type Worker struct {
	client dicom_worker.DicomWorkerServiceClient
}

// NewWorker создает новый экземпляр Worker с указанным клиентом DicomWorkerServiceClient.
func NewWorker(client dicom_worker.DicomWorkerServiceClient) *Worker {
	return &Worker{
		client: client,
	}
}

// ProcessDicomFiles отправляет список идентификаторов DICOM-файлов на обработку.
func (w *Worker) ProcessDicomFiles(ctx context.Context, dicomIDs []string, settings map[string]float64) (map[string]uuid.UUID, error) {
	dicoms := make([]*dicom_worker.DicomData, 0, len(dicomIDs))
	for _, id := range dicomIDs {
		dicoms = append(dicoms, &dicom_worker.DicomData{Id: id})
	}

	req := &dicom_worker.ProcessDicomFilesIn{Dicoms: dicoms, Settings: settings}
	resp, err := w.client.ProcessDicomFiles(ctx, req)
	if err != nil {
		return nil, fmt.Errorf("rpc call to ProcessDicomFiles failed: %w", err)
	}

	result := make(map[string]uuid.UUID)
	for dicomID, jobID := range resp.JobIds {
		jobUUID, err := uuid.Parse(jobID)
		if err != nil {
			return nil, fmt.Errorf("failed to parse jobID %s: %w", jobID, err)
		}
		result[dicomID] = jobUUID
	}

	return result, nil
}
