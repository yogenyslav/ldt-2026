package job

import (
	"context"
	"time"

	"github.com/yogenyslav/ldt-2026/dicom-worker/pkg/database"
)

// Storage репозиторий задач обработки DICOM-файлов.
type Storage struct {
	db database.DB
}

// GetExpiredForUpdate блокирует одну задачу с истекшим таймаутом текущего статуса.
func (s *Storage) GetExpiredForUpdate(ctx context.Context, pendingTimeout, runningTimeout time.Duration) (Job, error) {
	const query = `select id, dicom_id, status, created_at, updated_at
                from analyzer_jobs
                where (status = 'pending' and updated_at <= now() - $1 * interval '1 second')
                   or (status = 'running' and updated_at <= now() - $2 * interval '1 second')
                order by updated_at, id
                limit 1 for update skip locked`
	var job Job
	err := s.db.TxQueryRow(ctx, &job, query, pendingTimeout.Seconds(), runningTimeout.Seconds())
	return job, err
}

// New создает новый экземпляр репозитория задач.
func New(db database.DB) *Storage {
	return &Storage{db: db}
}

// SaveJob сохраняет задачу в текущей транзакции.
func (s *Storage) SaveJob(ctx context.Context, jobID, dicomID string) error {
	const query = `insert into analyzer_jobs (id, dicom_id) values ($1, $2)`
	_, err := s.db.TxExec(ctx, query, jobID, dicomID)
	return err
}

// GetByIDs возвращает задачи с указанными идентификаторами.
func (s *Storage) GetByIDs(ctx context.Context, jobIDs []string) ([]Job, error) {
	const query = `select id, dicom_id, status, created_at, updated_at
                from analyzer_jobs
                where id = any($1::uuid[])
                order by created_at, id`
	var jobs []Job
	err := s.db.QuerySlice(ctx, &jobs, query, jobIDs)
	return jobs, err
}

// GetByIDForUpdate блокирует задачу до завершения текущей транзакции.
func (s *Storage) GetByIDForUpdate(ctx context.Context, jobID string) (Job, error) {
	const query = `select id, dicom_id, status, created_at, updated_at
                from analyzer_jobs where id = $1 for update`
	var job Job
	err := s.db.TxQueryRow(ctx, &job, query, jobID)
	return job, err
}

// UpdateJobStatus обновляет статус задачи и причину ошибки в текущей транзакции.
func (s *Storage) UpdateJobStatus(ctx context.Context, jobID, status, errorMessage string) error {
	const query = `update analyzer_jobs
                set status = $2, error = $3, updated_at = now()
                where id = $1`
	_, err := s.db.TxExec(ctx, query, jobID, status, errorMessage)
	return err
}

// SaveResult сохраняет результат анализа в текущей транзакции.
func (s *Storage) SaveResult(ctx context.Context, jobID string, result DetectionProperties) error {
	const query = `insert into analyzer_job_results
                (id, anatomical_region, confidence, violations, duration_ms, metadata)
                values ($1, $2, $3, $4, $5, $6)`
	_, err := s.db.TxExec(
		ctx, query, jobID, result.AnatomicalRegion, result.Confidence,
		result.Violations, result.DurationMs, result.Metadata,
	)
	return err
}
