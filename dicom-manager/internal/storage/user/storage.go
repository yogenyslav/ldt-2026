package user

import (
	"context"

	sq "github.com/Masterminds/squirrel"
	"github.com/yogenyslav/ldt-2026/dicom-manager/pkg/database"
)

// Storage структура для работы с пользователями в БД.
type Storage struct {
	db database.DB
}

// New создает новый экземпляр репозитория пользователей.
func New(db database.DB) *Storage {
	return &Storage{db: db}
}

// FindByID возвращает пользователя по его ID.
func (s *Storage) FindByID(ctx context.Context, id int64) (User, error) {
	return s.findUserByColumn(ctx, "id", id)
}

// FindByEmail возвращает пользователя по его email.
func (s *Storage) FindByEmail(ctx context.Context, email string) (User, error) {
	return s.findUserByColumn(ctx, "email", email)
}

func (s *Storage) findUserByColumn(ctx context.Context, columnName string, value any) (User, error) {
	query, args, err := sq.Select("id", "organization_id", "full_name", "email", "password_hash", "role").
		From(`"user"`).
		Where(sq.Eq{columnName: value}).
		PlaceholderFormat(sq.Dollar).
		ToSql()
	if err != nil {
		return User{}, err
	}

	var user User
	err = s.db.QueryRow(ctx, &user, query, args...)
	if err != nil {
		return User{}, err
	}
	return user, nil
}
