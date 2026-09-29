package settings

import (
	"context"
	"encoding/json"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/yogenyslav/ldt-2026/dicom-manager/pkg/database"
)

// Storage хранит текущие параметры анализа отдельно от результатов задач.
type Storage struct {
	db database.DB
}

// New создает новый экземпляр Storage.
func New(db database.DB) *Storage {
	return &Storage{db: db}
}

// Get возвращает сохраненные параметры организации или nil, если их еще нет.
func (s *Storage) Get(ctx context.Context, organizationID int64) (map[string]float64, error) {
	const query = `select settings from analysis_settings where organization_id = $1`

	var row Settings
	err := s.db.TxQueryRow(ctx, &row, query, organizationID)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}

	var settings map[string]float64
	if err = json.Unmarshal(row.Payload, &settings); err != nil {
		return nil, err
	}

	return settings, nil
}

// Save атомарно заменяет сохраненные параметры организации.
func (s *Storage) Save(ctx context.Context, organizationID int64, settings map[string]float64) error {
	const query = `insert into analysis_settings (organization_id, settings) values ($1, $2)
		on conflict (organization_id) do update set settings = excluded.settings, updated_at = now()`

	payload, err := json.Marshal(settings)
	if err != nil {
		return err
	}

	_, err = s.db.Exec(ctx, query, organizationID, payload)
	return err
}
