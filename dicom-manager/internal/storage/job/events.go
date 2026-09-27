package job

import (
 "context"

)

// GetStateForUpdate блокирует состояние задачи до завершения текущей транзакции.
func (s *Storage) GetStateForUpdate(ctx context.Context, jobID string) (JobState, error) {
	const query = `select dicom_file_id, job_status
                from dicom_job_result where job_id = $1 for update`
	var state JobState
	err := s.db.TxQueryRow(ctx, &state, query, jobID)
	return state, err
}

// SaveCompletedResult сохраняет статус и результат анализа в текущей транзакции.
func (s *Storage) SaveCompletedResult(ctx context.Context, jobID string, result DetectionProperties) error {
	const query = `update dicom_job_result set
                job_status = 'completed', anatomical_region = $2, confidence = $3,
                violations = $4, duration_ms = $5, metadata = $6, updated_at = now()
                where job_id = $1`
	_, err := s.db.TxExec(
		ctx, query, jobID, result.AnatomicalRegion, result.Confidence,
		result.Violations, result.DurationMs, result.Metadata,
	)
	return err
}

// SaveFailedResult сохраняет статус и описание ошибки в текущей транзакции.
func (s *Storage) SaveFailedResult(ctx context.Context, jobID string, metadata []byte) error {
	const query = `update dicom_job_result
                set job_status = 'failed', metadata = $2, updated_at = now()
                where job_id = $1`
	_, err := s.db.TxExec(ctx, query, jobID, metadata)
	return err
}

// MarkRunning переводит ожидающую задачу в обработку в текущей транзакции.
func (s *Storage) MarkRunning(ctx context.Context, jobID string) error {
	const query = `update dicom_job_result set job_status = 'running', updated_at = now()
                where job_id = $1 and job_status = 'pending'`
	_, err := s.db.TxExec(ctx, query, jobID)
	return err
}
