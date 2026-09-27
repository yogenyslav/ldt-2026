package outbox

import (
	"context"

	"github.com/yogenyslav/ldt-2026/dicom-worker/pkg/database"
)

// Storage репозиторий исходящих событий.
type Storage struct {
	db database.DB
}

// New создает новый экземпляр репозитория исходящих событий.
func New(db database.DB) *Storage {
	return &Storage{db: db}
}

// SaveEvent сохраняет событие в текущей транзакции.
func (s *Storage) SaveEvent(ctx context.Context, event Event) error {
	const query = `insert into outbox_events (id, job_id, event_type, payload)
                values ($1, $2, $3, $4)`
	_, err := s.db.TxExec(ctx, query, event.ID, event.JobID, event.Subject, event.Payload)
	return err
}

// GetNextForUpdate блокирует готовое к отправке событие, пропуская занятые строки.
func (s *Storage) GetNextForUpdate(ctx context.Context) (Event, error) {
	const query = `select id, job_id, event_type, payload
                from outbox_events
                where publishing_status = 'pending' and available_at <= now()
                order by created_at, id
                limit 1 for update skip locked`
	var event Event
	err := s.db.TxQueryRow(ctx, &event, query)
	return event, err
}

// SavePublishError сохраняет ошибку публикации и время следующей попытки.
func (s *Storage) SavePublishError(ctx context.Context, eventID, errorMessage string) error {
	const query = `update outbox_events set
                attempts = attempts + 1,
                last_error = $2,
                available_at = now() + least(300, power(2, least(attempts, 8))) * interval '1 second'
                where id = $1`
	_, err := s.db.TxExec(ctx, query, eventID, errorMessage)
	return err
}

// MarkPublished отмечает событие как доставленное в текущей транзакции.
func (s *Storage) MarkPublished(ctx context.Context, eventID string) error {
	const query = `update outbox_events set
                publishing_status = 'published', published_at = now(),
                attempts = attempts + 1, last_error = null
                where id = $1`
	_, err := s.db.TxExec(ctx, query, eventID)
	return err
}
