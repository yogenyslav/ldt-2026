package get_users

import (
	"context"

	"github.com/rs/zerolog"
	storage "github.com/yogenyslav/ldt-2026/dicom-manager/internal/storage/organization"
	"github.com/yogenyslav/ldt-2026/dicom-manager/pkg/observability"
)

type organizationRepo interface {
	GetUsersByOrganizationID(ctx context.Context, organizationID int64, offset, limit uint64) ([]storage.User, error)
}

// Usecase структура для слоя бизнес-логики, связанного с получением пользователей по ID организации.
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

// GetUsers возвращает список пользователей, принадлежащих к организации по ее ID.
func (uc *Usecase) GetUsers(ctx context.Context, in GetUsersRequest) ([]User, error) {
	uc.metrics.Counter("usecase.get_users_by_organization_id.total").Inc()

	users, err := uc.orgRepo.GetUsersByOrganizationID(ctx, in.OrganizationID, in.Offset, in.Limit)
	if err != nil {
		uc.metrics.Counter("usecase.get_users_by_organization_id.error").Inc()
		uc.log.Error().Err(err).Msg("failed to get users by organization id")
		return nil, err
	}

	uc.metrics.Counter("usecase.get_users_by_organization_id.ok").Inc()

	result := make([]User, len(users))
	for i, u := range users {
		result[i] = User{
			ID:       u.ID,
			FullName: u.FullName,
		}
	}

	return result, nil
}
