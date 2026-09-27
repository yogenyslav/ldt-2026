package get_by_id

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/rs/zerolog"
	storage "github.com/yogenyslav/ldt-2026/dicom-manager/internal/storage/user"
	"github.com/yogenyslav/ldt-2026/dicom-manager/pkg/observability"
)

var (
	// ErrUserNotFound ошибка, возвращаемая при отсутствии пользователя в БД.
	ErrUserNotFound = errors.New("user not found")
)

// userRepo интерфейс для работы с пользователями в БД.
type userRepo interface {
	FindByID(ctx context.Context, id int64) (storage.User, error)
}

// Usecase структура для реализации бизнес-логики получения пользователя по ID.
type Usecase struct {
	log      *zerolog.Logger
	metrics  observability.MetricsClient
	userRepo userRepo
}

// New создает новый экземпляр Usecase.
func New(l *zerolog.Logger, m observability.MetricsClient, userRepo userRepo) *Usecase {
	return &Usecase{
		log:      l,
		metrics:  m,
		userRepo: userRepo,
	}
}

// GetByID возвращает пользователя по его ID.
func (uc *Usecase) GetByID(ctx context.Context, id int64) (User, error) {
	uc.metrics.Counter("usecase.get_user_by_id.total").Inc()

	user, err := uc.userRepo.FindByID(ctx, id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			uc.metrics.Counter("usecase.get_user_by_id.not_found").Inc()
			uc.log.Warn().Msg("user not found by id")
			return User{}, fmt.Errorf("user not found by id: %w", ErrUserNotFound)
		}

		uc.metrics.Counter("usecase.get_user_by_id.error").Inc()
		uc.log.Error().Err(err).Msg("failed to get user by id")
		return User{}, fmt.Errorf("failed to get user by id: %w", err)
	}

	uc.metrics.Counter("usecase.get_user_by_id.ok").Inc()
	return User{
		ID:             user.ID,
		FullName:       user.FullName,
		Email:          user.Email,
		Role:           user.Role,
		OrganizationID: user.OrganizationID,
	}, nil
}
