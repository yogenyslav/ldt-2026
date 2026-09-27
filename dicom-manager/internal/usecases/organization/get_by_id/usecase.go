package get_by_id

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/rs/zerolog"
	storage "github.com/yogenyslav/ldt-2026/dicom-manager/internal/storage/organization"
	"github.com/yogenyslav/ldt-2026/dicom-manager/pkg/observability"
)

var (
	// ErrOrganizationNotFound ошибка, возвращаемая при отсутствии организации в БД.
	ErrOrganizationNotFound = errors.New("organization not found")
)

type organizationRepo interface {
	FindByID(ctx context.Context, id int64) (storage.Organization, error)
}

// Usecase структура для слоя бизнес-логики, связанного с получением организации по ID.
type Usecase struct {
	log     *zerolog.Logger
	metrics observability.MetricsClient
	orgRepo organizationRepo
}

// New создает новый экземпляр Usecase.
func New(l *zerolog.Logger, m observability.MetricsClient, orgRepo organizationRepo) *Usecase {
	return &Usecase{
		log:     l,
		metrics: m,
		orgRepo: orgRepo,
	}
}

// GetByID возвращает организацию по ее ID.
func (uc *Usecase) GetByID(ctx context.Context, organizationID int64) (Organization, error) {
	uc.metrics.Counter("usecase.get_organization_by_id.total").Inc()

	org, err := uc.orgRepo.FindByID(ctx, organizationID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			uc.metrics.Counter("usecase.get_organization_by_id.not_found").Inc()
			uc.log.Warn().Msg("organization not found by id")
			return Organization{}, ErrOrganizationNotFound
		}
		uc.metrics.Counter("usecase.get_organization_by_id.error").Inc()
		uc.log.Error().Err(err).Msg("failed to get organization by id")
		return Organization{}, err
	}

	uc.metrics.Counter("usecase.get_organization_by_id.ok").Inc()
	return Organization{
		ID:   org.ID,
		Name: org.Name,
	}, nil
}
