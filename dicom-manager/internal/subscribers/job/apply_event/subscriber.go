package apply_event

import (
	"context"
	"errors"
	"fmt"

	"github.com/rs/zerolog"
	"github.com/yogenyslav/ldt-2026/dicom-manager/pkg/events"
	"github.com/yogenyslav/ldt-2026/dicom-manager/pkg/messaging"
	"github.com/yogenyslav/ldt-2026/dicom-manager/pkg/observability"
)

type usecase interface {
	ApplyEvent(ctx context.Context, event events.Event) error
}

// Subscriber обработчик событий обновления задачи из NATS.
type Subscriber struct {
	log     *zerolog.Logger
	metrics observability.MetricsClient
	uc      usecase
	subject string
}

// New создает новый экземпляр Subscriber для указанного топика.
func New(l *zerolog.Logger, m observability.MetricsClient, uc usecase, subject string) *Subscriber {
	return &Subscriber{
		log:     l,
		metrics: m,
		uc:      uc,
		subject: subject,
	}
}

// Handle проверяет сообщение и передает его бизнес-логике обработки задачи.
func (h *Subscriber) Handle(ctx context.Context, payload []byte) error {
	h.metrics.Counter("subscriber.job.apply_event.total").Inc()

	event, err := events.Decode(h.subject, payload)
	if err == nil {
		err = h.uc.ApplyEvent(ctx, event)
	}
	
	if errors.Is(err, events.ErrInvalidEvent) {
		h.metrics.Counter("subscriber.job.apply_event.invalid").Inc()
		h.metrics.Counter("subscriber.job.apply_event.error").Inc()
		h.log.Warn().Err(err).Str("subject", h.subject).Str("event_id", event.EventID).Str("job_id", event.JobID).Msg("invalid job message")
		return fmt.Errorf("%w: %v", messaging.ErrPermanentMessage, err)
	}
	if err != nil {
		h.metrics.Counter("subscriber.job.apply_event.error").Inc()
		h.log.Error().Err(err).Str("subject", h.subject).Str("event_id", event.EventID).Str("job_id", event.JobID).Msg("job message processing failed")
		return err
	}

	h.metrics.Counter("subscriber.job.apply_event.ok").Inc()
	return nil
}
