package save

import (
	"context"
	"errors"
	"fmt"

	"github.com/rs/zerolog"
	"github.com/yogenyslav/ldt-2026/dicom-manager/pkg/events"
	"github.com/yogenyslav/ldt-2026/dicom-manager/pkg/observability"
)

// ErrInvalid означает, что параметры анализа не прошли проверку.
var ErrInvalid = errors.New("invalid analysis settings")

type settingsRepo interface {
	Save(ctx context.Context, organizationID int64, settings map[string]float64) error
}

// Usecase содержит бизнес-логику сохранения параметров анализа.
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

// Save выполняет операцию сохранения параметров анализа организации.
func (uc *Usecase) Save(ctx context.Context, organizationID int64, settings map[string]float64) (map[string]float64, error) {
	uc.metrics.Counter("usecases.settings.save.total").Inc()

	if len(settings) != 3 {
		uc.metrics.Counter("usecases.settings.save.invalid").Inc()
		return nil, ErrInvalid
	}

	resolved, err := events.ResolveSettings(settings)
	if err != nil {
		uc.metrics.Counter("usecases.settings.save.invalid").Inc()
		return nil, fmt.Errorf("%w: %v", ErrInvalid, err)
	}

	if err = uc.settingsRepo.Save(ctx, organizationID, resolved); err != nil {
		uc.metrics.Counter("usecases.settings.save.error").Inc()
		uc.log.Error().Err(err).Msg("failed to save analysis settings")
		return nil, err
	}

	uc.metrics.Counter("usecases.settings.save.ok").Inc()
	return resolved, nil
}
