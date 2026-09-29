package get

import (
	"context"

	"github.com/rs/zerolog"
	"github.com/yogenyslav/ldt-2026/dicom-manager/pkg/events"
	"github.com/yogenyslav/ldt-2026/dicom-manager/pkg/observability"
)

type settingsRepo interface {
	Get(ctx context.Context, organizationID int64) (map[string]float64, error)
}

// Usecase содержит бизнес-логику получения параметров анализа.
type Usecase struct {
	log          *zerolog.Logger
	metrics      observability.MetricsClient
	settingsRepo settingsRepo
}

// New создает новый экземпляр Usecase.
func New(log *zerolog.Logger, metrics observability.MetricsClient, settingsRepo settingsRepo) *Usecase {
	return &Usecase{
		log:          log,
		metrics:      metrics,
		settingsRepo: settingsRepo,
	}
}

// Get выполняет операцию получения параметров анализа организации.
func (uc *Usecase) Get(ctx context.Context, organizationID int64) (map[string]float64, error) {
	uc.metrics.Counter("usecases.settings.get.total").Inc()

	settings, err := uc.settingsRepo.Get(ctx, organizationID)
	if err == nil {
		settings, err = events.ResolveSettings(settings)
	}

	if err != nil {
		uc.metrics.Counter("usecases.settings.get.error").Inc()
		uc.log.Error().Err(err).Msg("failed to get analysis settings")
		return nil, err
	}

	uc.metrics.Counter("usecases.settings.get.ok").Inc()
	return settings, nil
}
