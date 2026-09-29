package process

import (
	"context"
	"time"

	"github.com/google/uuid"
	"github.com/rs/zerolog"
	"github.com/yogenyslav/ldt-2026/dicom-worker/pkg/database"
	"github.com/yogenyslav/ldt-2026/dicom-worker/pkg/events"
	"github.com/yogenyslav/ldt-2026/dicom-worker/pkg/observability"
)

type jobRepo interface {
	SaveJob(ctx context.Context, jobID, dicomID string) error
}

type eventCreator interface {
	CreateEvent(ctx context.Context, subject string, event events.Event) error
}

// Usecase бизнес-логика создания задач обработки DICOM-файлов.
type Usecase struct {
	log          *zerolog.Logger
	metrics      observability.MetricsClient
	uow          database.UnitOfWork
	jobRepo      jobRepo
	eventCreator eventCreator
}

// New создает новый экземпляр Usecase.
func New(l *zerolog.Logger, m observability.MetricsClient, uow database.UnitOfWork, jobRepo jobRepo, eventCreator eventCreator) *Usecase {
	return &Usecase{
		log:          l,
		metrics:      m,
		uow:          uow,
		jobRepo:      jobRepo,
		eventCreator: eventCreator,
	}
}

// ProcessDicomFiles сохраняет задачи и исходящие события в одной транзакции.
func (uc *Usecase) ProcessDicomFiles(ctx context.Context, dicomIDs []string, settings map[string]float64) (map[string]string, error) {
	uc.metrics.Counter("usecases.job.process.total").Inc()

	startedAt := time.Now()
	defer func() {
		uc.metrics.Gauge("usecases.job.process.duration_seconds").Set(time.Since(startedAt).Seconds())
	}()

	resolved, err := events.ResolveSettings(settings)
	if err != nil {
		return nil, err
	}

	dicomJobs := make(map[string]string, len(dicomIDs))
	err = uc.uow.WithTx(ctx, database.TxLevelReadCommitted, func(ctx context.Context) error {
		for _, dicomID := range dicomIDs {
			if _, exists := dicomJobs[dicomID]; exists {
				continue
			}

			jobID := uuid.NewString()
			if err := uc.jobRepo.SaveJob(ctx, jobID, dicomID); err != nil {
				return err
			}

			event := events.New(jobID, dicomID, events.StatusPending)
			event.Settings = resolved
			if err := uc.eventCreator.CreateEvent(ctx, events.AnalysisRequested, event); err != nil {
				return err
			}

			dicomJobs[dicomID] = jobID
		}
		return nil
	})

	if err != nil {
		uc.metrics.Counter("usecases.job.process.error").Inc()
		uc.log.Error().Err(err).Int("dicom_count", len(dicomIDs)).Msg("failed to create processing jobs")
		return nil, err
	}

	uc.metrics.Counter("usecases.job.process.ok").Inc()
	uc.metrics.Counter("usecases.job.process.jobs_created").Add(float64(len(dicomJobs)))
	uc.log.Info().Int("job_count", len(dicomJobs)).Msg("processing jobs created")
	return dicomJobs, nil
}
