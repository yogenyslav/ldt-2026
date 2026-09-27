package outbox

// Event структура события в таблице исходящих сообщений.
type Event struct {
	ID      string `db:"id"`
	JobID   string `db:"job_id"`
	Subject string `db:"event_type"`
	Payload []byte `db:"payload"`
}
