package apply_result

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/rs/zerolog"
	storage "github.com/yogenyslav/ldt-2026/dicom-worker/internal/storage/job"
	"github.com/yogenyslav/ldt-2026/dicom-worker/pkg/database"
	"github.com/yogenyslav/ldt-2026/dicom-worker/pkg/events"
	"github.com/yogenyslav/ldt-2026/dicom-worker/pkg/observability"
)

type jobRepo interface {
	GetByIDForUpdate(ctx context.Context, jobID string) (storage.Job, error)
	SaveResult(ctx context.Context, jobID string, result storage.DetectionProperties) error
	UpdateJobStatus(ctx context.Context, jobID, status, errorMessage string) error
}

type eventCreator interface {
	CreateEvent(ctx context.Context, subject string, event events.Event) error
}

// Usecase бизнес-логика сохранения результата анализа.
type Usecase struct {
	log          *zerolog.Logger
	metrics      observability.MetricsClient
	uow          database.UnitOfWork
	jobRepo      jobRepo
	eventCreator eventCreator
}

// New создает новый экземпляр Usecase.
func New(
	l *zerolog.Logger, m observability.MetricsClient,
	uow database.UnitOfWork, jobRepo jobRepo, eventCreator eventCreator) *Usecase {
	return &Usecase{
		log:          l,
		metrics:      m,
		uow:          uow,
		jobRepo:      jobRepo,
		eventCreator: eventCreator,
	}
}

// ApplyResult атомарно сохраняет конечный статус, результат и уведомление manager.
func (uc *Usecase) ApplyResult(ctx context.Context, event events.Event) error {
	uc.metrics.Counter("usecases.job.apply_result.total").Inc()

	startedAt := time.Now()
	defer func() {
		uc.metrics.Gauge("usecases.job.apply_result.duration_seconds").Set(time.Since(startedAt).Seconds())
	}()

	ignored := false
	err := uc.uow.WithTx(ctx, database.TxLevelReadCommitted, func(ctx context.Context) error {
		job, err := uc.jobRepo.GetByIDForUpdate(ctx, event.JobID)
		if err != nil {
			return err
		}

		if job.DicomID != event.DicomID {
			return fmt.Errorf("%w: dicom_id does not match job", events.ErrInvalidEvent)
		}

		if job.Status == events.StatusCompleted || job.Status == events.StatusFailed {
			ignored = true
			return nil
		}

		subject := events.DocumentFailed
		if event.Status == events.StatusCompleted {
			result := storage.DetectionProperties{
				AnatomicalRegion: event.Result.AnatomicalRegion,
				Confidence:       event.Result.Confidence,
				Violations:       event.Result.Violations,
				DurationMs:       event.Result.DurationMs,
				Metadata:         []byte(event.Result.Metadata),
			}
			if err = uc.jobRepo.SaveResult(ctx, event.JobID, result); err != nil {
				return err
			}
			subject = events.DocumentUpdated
		}

		if err = uc.jobRepo.UpdateJobStatus(ctx, event.JobID, event.Status, event.Error); err != nil {
			return err
		}

		notification := events.New(event.JobID, event.DicomID, event.Status)
		notification.Result = event.Result
		notification.Error = event.Error
		return uc.eventCreator.CreateEvent(ctx, subject, notification)
	})

	if err != nil {
		uc.metrics.Counter("usecases.job.apply_result.error").Inc()

		switch {
		case errors.Is(err, pgx.ErrNoRows):
			uc.metrics.Counter("usecases.job.apply_result.not_found").Inc()
			uc.log.Warn().Err(err).Str("job_id", event.JobID).Str("event_id", event.EventID).Msg("job not found; event will be retried")
		case errors.Is(err, events.ErrInvalidEvent):
			uc.metrics.Counter("usecases.job.apply_result.invalid").Inc()
			uc.log.Warn().Err(err).Str("job_id", event.JobID).Str("event_id", event.EventID).Msg("job event rejected")
		default:
			uc.log.Error().Err(err).Str("job_id", event.JobID).Str("event_id", event.EventID).Msg("failed to apply job event")
		}

		return err
	}

	if ignored {
		uc.metrics.Counter("usecases.job.apply_result.ignored").Inc()
		uc.log.Debug().Str("job_id", event.JobID).Str("event_id", event.EventID).Msg("terminal job event ignored")
		return nil
	}

	uc.metrics.Counter("usecases.job.apply_result.ok").Inc()
	uc.metrics.Counter(fmt.Sprintf("usecases.job.apply_result.%s", event.Status)).Inc()
	
	uc.log.Info().Str("job_id", event.JobID).Str("event_id", event.EventID).Str("status", event.Status).Msg("job event committed")
	return nil
}
