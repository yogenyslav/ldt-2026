package wrappers

import (
	"context"
	"uuid"
)

// JobRepo интерфейс для работы с репозиторием задач обработки DICOM-файлов.
type JobRepo interface {
	SaveJobs(ctx context.Context, jobToDicom map[string]string) error
}

// JobCreator структура для создания задач обработки DICOM-файлов.
type JobCreator struct {
	jobRepo JobRepo
}

// NewJobCreator создает новый экземпляр JobCreator.
func NewJobCreator(jobRepo JobRepo) *JobCreator {
	return &JobCreator{
		jobRepo: jobRepo,
	}
}

// CreateJobs сохраняет задачи обработки DICOM-файлов в репозитории.
func (jc *JobCreator) CreateJobs(ctx context.Context, dicomJobs map[string]uuid.UUID) error {
	jobToDicom := make(map[string]string, len(dicomJobs))
	for dicomID, jobID := range dicomJobs {
		jobToDicom[jobID.String()] = dicomID
	}

	return jc.jobRepo.SaveJobs(ctx, jobToDicom)
}
