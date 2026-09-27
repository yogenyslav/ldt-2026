package create

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/rs/zerolog"
	storage "github.com/yogenyslav/ldt-2026/dicom-worker/internal/storage/outbox"
	"github.com/yogenyslav/ldt-2026/dicom-worker/pkg/events"
	"github.com/yogenyslav/ldt-2026/dicom-worker/pkg/observability"
)

type outboxRepo interface {
	SaveEvent(ctx context.Context, event storage.Event) error
}

// Usecase бизнес-логика подготовки исходящего события.
type Usecase struct {
	log        *zerolog.Logger
	metrics    observability.MetricsClient
	outboxRepo outboxRepo
}

// New создает новый экземпляр Usecase.
func New(l *zerolog.Logger, m observability.MetricsClient, outboxRepo outboxRepo) *Usecase {
	return &Usecase{
		log:        l,
		metrics:    m,
		outboxRepo: outboxRepo,
	}
}

// CreateEvent сериализует событие и сохраняет его в текущей транзакции.
func (uc *Usecase) CreateEvent(ctx context.Context, subject string, event events.Event) error {
	uc.metrics.Counter("usecases.outbox.create.total").Inc()

	startedAt := time.Now()
	defer func() {
		uc.metrics.Gauge("usecases.outbox.create.duration_seconds").Set(time.Since(startedAt).Seconds())
	}()

	if err := event.Validate(subject); err != nil {
		uc.metrics.Counter("usecases.outbox.create.error").Inc()
		uc.metrics.Counter("usecases.outbox.create.invalid").Inc()
		uc.log.Error().Err(err).Str("subject", subject).Str("event_id", event.EventID).
			Str("job_id", event.JobID).Msg("invalid outgoing event")
		return fmt.Errorf("%w: %v", events.ErrInvalidEvent, err)
	}

	payload, err := json.Marshal(event)
	if err != nil {
		uc.metrics.Counter("usecases.outbox.create.error").Inc()
		uc.log.Error().Err(err).Str("event_id", event.EventID).Str(
			"job_id", event.JobID,
		).Msg("failed to marshal outbox event")
		return fmt.Errorf("marshal outbox event: %w", err)
	}

	err = uc.outboxRepo.SaveEvent(
		ctx, storage.Event{
			ID:      event.EventID,
			JobID:   event.JobID,
			Subject: subject,
			Payload: payload,
		},
	)
	if err != nil {
		uc.metrics.Counter("usecases.outbox.create.error").Inc()
		uc.log.Error().Err(err).Str("event_id", event.EventID).Str(
			"job_id", event.JobID,
		).Msg("failed to save outbox event")
		return err
	}

	// Счетчик отражает вставку в текущей транзакции, а не ее окончательный commit.
	uc.metrics.Counter("usecases.outbox.create.ok").Inc()
	return nil
}
