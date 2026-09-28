package get_all

import (
	"context"

	"github.com/rs/zerolog"
	storage "github.com/yogenyslav/ldt-2026/dicom-manager/internal/storage/organization"
	"github.com/yogenyslav/ldt-2026/dicom-manager/pkg/observability"
)

type organizationRepo interface {
	GetAll(ctx context.Context) ([]storage.Organization, error)
}

// Usecase содержит бизнес-логику получения всех организаций.
type Usecase struct {
	log     *zerolog.Logger
	metrics observability.MetricsClient
	orgRepo organizationRepo
}

// New создает новый экземпляр Usecase.
func New(log *zerolog.Logger, metrics observability.MetricsClient, orgRepo organizationRepo) *Usecase {
	return &Usecase{log: log, metrics: metrics, orgRepo: orgRepo}
}

// GetAll возвращает все организации.
func (uc *Usecase) GetAll(ctx context.Context) ([]Organization, error) {
	uc.metrics.Counter("usecase.get_all_organizations.total").Inc()
	
	organizations, err := uc.orgRepo.GetAll(ctx)
	if err != nil {
		uc.metrics.Counter("usecase.get_all_organizations.error").Inc()
		uc.log.Error().Err(err).Msg("failed to get all organizations")
		return nil, err
	}

	result := make([]Organization, len(organizations))
	for i, org := range organizations {
		result[i] = Organization{ID: org.ID, Name: org.Name}
	}

	uc.metrics.Counter("usecase.get_all_organizations.ok").Inc()
	return result, nil
}
