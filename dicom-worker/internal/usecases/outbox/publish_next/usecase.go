package publish_next

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/rs/zerolog"
	job_storage "github.com/yogenyslav/ldt-2026/dicom-worker/internal/storage/job"
	outbox_storage "github.com/yogenyslav/ldt-2026/dicom-worker/internal/storage/outbox"
	"github.com/yogenyslav/ldt-2026/dicom-worker/pkg/database"
	"github.com/yogenyslav/ldt-2026/dicom-worker/pkg/events"
	"github.com/yogenyslav/ldt-2026/dicom-worker/pkg/observability"
)

type jobRepo interface {
	GetByIDForUpdate(ctx context.Context, jobID string) (job_storage.Job, error)
	UpdateJobStatus(ctx context.Context, jobID, status, errorMessage string) error
}

type outboxRepo interface {
	GetNextForUpdate(ctx context.Context) (outbox_storage.Event, error)
	SavePublishError(ctx context.Context, eventID, errorMessage string) error
	MarkPublished(ctx context.Context, eventID string) error
}

type eventCreator interface {
	CreateEvent(ctx context.Context, subject string, event events.Event) error
}

type publisher interface {
	Publish(ctx context.Context, subject, eventID string, payload []byte) error
}

// Usecase бизнес-логика публикации исходящих событий.
type Usecase struct {
	log          *zerolog.Logger
	metrics      observability.MetricsClient
	uow          database.UnitOfWork
	jobRepo      jobRepo
	outboxRepo   outboxRepo
	eventCreator eventCreator
	publisher    publisher
}

// New создает новый экземпляр Usecase.
func New(
	l *zerolog.Logger, m observability.MetricsClient,
	uow database.UnitOfWork, jobRepo jobRepo, outboxRepo outboxRepo,
	eventCreator eventCreator, publisher publisher,
) *Usecase {
	return &Usecase{
		log:          l,
		metrics:      m,
		uow:          uow,
		jobRepo:      jobRepo,
		outboxRepo:   outboxRepo,
		eventCreator: eventCreator,
		publisher:    publisher,
	}
}

// PublishNext удерживает блокировку события до подтверждения публикации брокером.
// При падении процесса PostgreSQL снимает блокировку и разрешает повторную доставку.
func (uc *Usecase) PublishNext(ctx context.Context) (bool, error) {
	uc.metrics.Counter("usecases.outbox.publish_next.total").Inc()

	startedAt := time.Now()
	defer func() {
		uc.metrics.Gauge("usecases.outbox.publish_next.duration_seconds").Set(time.Since(startedAt).Seconds())
	}()

	found := false
	var eventID, jobID string
	var publishErr error

	err := uc.uow.WithTx(ctx, database.TxLevelReadCommitted, func(ctx context.Context) error {
		event, err := uc.outboxRepo.GetNextForUpdate(ctx)
		if errors.Is(err, pgx.ErrNoRows) {
			return nil
		}

		if err != nil {
			return err
		}

		found = true
		eventID = event.ID
		jobID = event.JobID
		var job job_storage.Job
		if event.Subject == events.AnalysisRequested {
			// Блокировка не дает быстрому ответу ML опередить сохранение статуса running.
			job, err = uc.jobRepo.GetByIDForUpdate(ctx, event.JobID)
			if err != nil {
				return err
			}
		}

		publishCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
		publishErr = uc.publisher.Publish(publishCtx, event.Subject, event.ID, event.Payload)
		cancel()
		if publishErr != nil {
			return uc.outboxRepo.SavePublishError(ctx, event.ID, publishErr.Error())
		}

		if err = uc.outboxRepo.MarkPublished(ctx, event.ID); err != nil {
			return err
		}

		if event.Subject == events.AnalysisRequested && job.Status == events.StatusPending {
			if err = uc.jobRepo.UpdateJobStatus(ctx, job.ID, events.StatusRunning, ""); err != nil {
				return err
			}

			notification := events.New(job.ID, job.DicomID, events.StatusRunning)
			return uc.eventCreator.CreateEvent(ctx, events.DocumentUpdated, notification)
		}
		return nil
	})

	resultErr := errors.Join(err, publishErr)
	if resultErr != nil {
		uc.metrics.Counter("usecases.outbox.publish_next.error").Inc()
		if publishErr != nil {
			uc.metrics.Counter("usecases.outbox.publish_next.publish_error").Inc()
		}

		if err != nil {
			uc.metrics.Counter("usecases.outbox.publish_next.transaction_error").Inc()
		}

		uc.log.Error().Err(resultErr).Str("event_id", eventID).Str("job_id", jobID).Msg("outbox event delivery failed")
		return found, resultErr
	}

	if !found {
		uc.metrics.Counter("usecases.outbox.publish_next.empty").Inc()
		return false, nil
	}
	
	uc.metrics.Counter("usecases.outbox.publish_next.ok").Inc()
	uc.log.Info().Str("event_id", eventID).Str("job_id", jobID).Msg("outbox event published")
	return true, nil
}
