package organization

import (
	"context"

	"github.com/yogenyslav/ldt-2026/dicom-manager/pkg/database"
)

// Storage структура для работы с организациями в БД.
type Storage struct {
	db database.DB
}

// New создает новый экземпляр Storage.
func New(db database.DB) *Storage {
	return &Storage{db: db}
}

// FindByID возвращает организацию по ее ID.
func (s *Storage) FindByID(ctx context.Context, id int64) (Organization, error) {
	const query = `select id, name from organization where id = $1;`
	var org Organization
	err := s.db.QueryRow(ctx, &org, query, id)
	if err != nil {
		return Organization{}, err
	}
	return org, nil
}

// GetUsersByOrganizationID возвращает список пользователей, принадлежащих к организации по ее ID.
func (s *Storage) GetUsersByOrganizationID(
	ctx context.Context,
	organizationID int64,
	offset, limit uint64,
) ([]User, error) {
	const query = `select id, full_name from "user" where organization_id = $1 order by id offset $2 limit $3;`

	var users []User
	err := s.db.QuerySlice(ctx, &users, query, organizationID, offset, limit)
	if err != nil {
		return nil, err
	}
	return users, nil
}

// GetAll возвращает все организации в порядке возрастания ID.
func (s *Storage) GetAll(ctx context.Context) ([]Organization, error) {
	const query = `select id, name from organization order by id;`
	var organizations []Organization
	if err := s.db.QuerySlice(ctx, &organizations, query); err != nil {
		return nil, err
	}
	return organizations, nil
}
