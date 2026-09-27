package get_by_ids

import (
	"context"
	"time"

	"github.com/rs/zerolog"
	storage "github.com/yogenyslav/ldt-2026/dicom-worker/internal/storage/job"
	"github.com/yogenyslav/ldt-2026/dicom-worker/pkg/observability"
)

type jobRepo interface {
	GetByIDs(ctx context.Context, jobIDs []string) ([]storage.Job, error)
}

// Usecase бизнес-логика получения задач по идентификаторам.
type Usecase struct {
	log     *zerolog.Logger
	metrics observability.MetricsClient
	jobRepo jobRepo
}

// New создает новый экземпляр Usecase.
func New(l *zerolog.Logger, m observability.MetricsClient, jobRepo jobRepo) *Usecase {
	return &Usecase{
		log:     l,
		metrics: m,
		jobRepo: jobRepo,
	}
}

// GetByIDs возвращает информацию о задачах обработки DICOM-файлов.
func (uc *Usecase) GetByIDs(ctx context.Context, jobIDs []string) ([]Job, error) {
	uc.metrics.Counter("usecases.job.get_by_ids.total").Inc()

	startedAt := time.Now()
	defer func() {
		uc.metrics.Gauge("usecases.job.get_by_ids.duration_seconds").Set(time.Since(startedAt).Seconds())
	}()

	jobs, err := uc.jobRepo.GetByIDs(ctx, jobIDs)
	if err != nil {
		uc.metrics.Counter("usecases.job.get_by_ids.error").Inc()
		uc.log.Error().Err(err).Int("job_count", len(jobIDs)).Msg("failed to get processing jobs")
		return nil, err
	}

	result := make([]Job, 0, len(jobs))
	for _, job := range jobs {
		result = append(result, Job{
			ID:        job.ID,
			DicomID:   job.DicomID,
			Status:    job.Status,
			CreatedAt: job.CreatedAt,
			UpdatedAt: job.UpdatedAt,
		})
	}

	uc.metrics.Counter("usecases.job.get_by_ids.ok").Inc()
	return result, nil
}
