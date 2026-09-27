package outbox

import (
	"context"
	"time"

	"github.com/rs/zerolog"
	"github.com/yogenyslav/ldt-2026/dicom-worker/pkg/observability"
)

type usecase interface {
	PublishNext(ctx context.Context) (bool, error)
}

// Dispatcher процесс фоновой публикации исходящих событий.
type Dispatcher struct {
	log     *zerolog.Logger
	metrics observability.MetricsClient
	uc      usecase
}

// New создает новый экземпляр Dispatcher.
func New(log *zerolog.Logger, metrics observability.MetricsClient, uc usecase) *Dispatcher {
	return &Dispatcher{
		log:     log,
		metrics: metrics,
		uc:      uc,
	}
}

// Run публикует готовые события до отмены контекста.
func (d *Dispatcher) Run(ctx context.Context) error {
	d.metrics.Gauge("outbox.dispatcher.active").Set(1)
	defer d.metrics.Gauge("outbox.dispatcher.active").Set(0)

	d.log.Info().Msg("outbox dispatcher started")
	defer d.log.Info().Msg("outbox dispatcher stopped")

	ticker := time.NewTicker(time.Second)
	defer ticker.Stop()

	for ctx.Err() == nil {
		workCtx, cancel := context.WithTimeout(ctx, 15*time.Second)
		found, err := d.uc.PublishNext(workCtx)
		cancel()
		if err != nil {
			d.log.Error().Err(err).Msg("outbox delivery failed")
		}
		
		if found && err == nil {
			continue
		}

		select {
		case <-ctx.Done():
			return nil
		case <-ticker.C:
		}
	}

	return nil
}
