package apply_event

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/rs/zerolog"
	"github.com/yogenyslav/ldt-2026/dicom-manager/pkg/observability"

	storage "github.com/yogenyslav/ldt-2026/dicom-manager/internal/storage/job"
	"github.com/yogenyslav/ldt-2026/dicom-manager/pkg/database"
	"github.com/yogenyslav/ldt-2026/dicom-manager/pkg/events"
)

type jobRepo interface {
	GetStateForUpdate(ctx context.Context, jobID string) (storage.JobState, error)
	SaveCompletedResult(ctx context.Context, jobID string, result storage.DetectionProperties) error
	SaveFailedResult(ctx context.Context, jobID string, metadata []byte) error
	MarkRunning(ctx context.Context, jobID string) error
}

// Usecase бизнес-логика применения событий обработки DICOM-файлов.
type Usecase struct {
	log     *zerolog.Logger
	metrics observability.MetricsClient
	uow     database.UnitOfWork
	jobRepo jobRepo
}

// New создает новый экземпляр Usecase.
func New(l *zerolog.Logger, m observability.MetricsClient, uow database.UnitOfWork, jobRepo jobRepo) *Usecase {
	return &Usecase{log: l, metrics: m,
		uow:     uow,
		jobRepo: jobRepo,
	}
}

// ApplyEvent атомарно обновляет статус и результат, сохраняя конечное состояние задачи.
// Отсутствующая задача возвращает ошибку для повторной доставки после завершения загрузки.
func (uc *Usecase) ApplyEvent(ctx context.Context, event events.Event) error {
	uc.metrics.Counter("usecases.job.apply_event.total").Inc()

	ignored := false
	err := uc.uow.WithTx(ctx, database.TxLevelReadCommitted, func(ctx context.Context) error {
		state, err := uc.jobRepo.GetStateForUpdate(ctx, event.JobID)
		if err != nil {
			return err
		}
		if state.DicomID != event.DicomID {
			return fmt.Errorf("%w: dicom_id does not match job", events.ErrInvalidEvent)
		}
		if state.Status == events.StatusCompleted || state.Status == events.StatusFailed {
			ignored = true
			return nil
		}

		if event.Status == events.StatusCompleted {
			result := storage.DetectionProperties{
				AnatomicalRegion: &event.Result.AnatomicalRegion,
				Confidence:       event.Result.Confidence,
				Violations:       event.Result.Violations,
				DurationMs:       &event.Result.DurationMs,
				Metadata:         []byte(event.Result.Metadata),
			}
			return uc.jobRepo.SaveCompletedResult(ctx, event.JobID, result)
		}

		if event.Status == events.StatusFailed {
			metadata, err := json.Marshal(map[string]string{"error": event.Error})
			if err != nil {
				return err
			}
			return uc.jobRepo.SaveFailedResult(ctx, event.JobID, metadata)
		}
		return uc.jobRepo.MarkRunning(ctx, event.JobID)
	})

	if err != nil {
		uc.metrics.Counter("usecases.job.apply_event.error").Inc()
		switch {
		case errors.Is(err, pgx.ErrNoRows):
			uc.metrics.Counter("usecases.job.apply_event.not_found").Inc()
			uc.log.Warn().Err(err).Str("job_id", event.JobID).Str("event_id", event.EventID).Msg("job not found; event will be retried")
		case errors.Is(err, events.ErrInvalidEvent):
			uc.metrics.Counter("usecases.job.apply_event.invalid").Inc()
			uc.log.Warn().Err(err).Str("job_id", event.JobID).Str("event_id", event.EventID).Msg("job event rejected")
		default:
			uc.log.Error().Err(err).Str("job_id", event.JobID).Str("event_id", event.EventID).Msg("failed to apply job event")
		}
		return err
	}

	if ignored {
		uc.metrics.Counter("usecases.job.apply_event.ignored").Inc()
		uc.log.Debug().Str("job_id", event.JobID).Str("event_id", event.EventID).Msg("terminal job event ignored")
		return nil
	}

	uc.metrics.Counter("usecases.job.apply_event.ok").Inc()
	uc.metrics.Counter(fmt.Sprintf("usecases.job.apply_event.%s", event.Status)).Inc()

	uc.log.Info().Str("job_id", event.JobID).Str("event_id", event.EventID).Str("status", event.Status).Msg("job event committed")
	return nil
}
