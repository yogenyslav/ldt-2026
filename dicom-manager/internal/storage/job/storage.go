package job

import (
	"context"

	sq "github.com/Masterminds/squirrel"
	"github.com/yogenyslav/ldt-2026/dicom-manager/pkg/database"
)

// Storage структура для работы с задачами обработки DICOM-файлов в БД.
type Storage struct {
	db database.DB
}

// New создает новый экземпляр репозитория задач обработки DICOM-файлов.
func New(db database.DB) *Storage {
	return &Storage{db: db}
}

// SaveJobs сохраняет несколько задач обработки DICOM-файлов в БД.
func (s *Storage) SaveJobs(ctx context.Context, jobToDicom map[string]string) error {
	baseQuery := sq.Insert("dicom_job_result").
		Columns("job_id", "dicom_file_id").
		PlaceholderFormat(sq.Dollar)

	for jobID, dicomID := range jobToDicom {
		baseQuery = baseQuery.Values(jobID, dicomID)
	}

	query, args, err := baseQuery.ToSql()
	if err != nil {
		return err
	}

	_, err = s.db.TxExec(ctx, query, args...)
	return err
}

// GetByID возвращает задачу обработки DICOM-файла по ID.
func (s *Storage) GetByID(ctx context.Context, jobID string) (DicomJobResult, error) {
	const query = `select 
						job_id, dicom_file_id, job_status, anatomical_region, 
						confidence, violations, duration_ms, metadata, specialist_decision, 
						specialist_id,comment, created_at, updated_at 
					from dicom_job_result where job_id = $1;`

	var job DicomJobResult
	err := s.db.QueryRow(ctx, &job, query, jobID)
	if err != nil {
		return DicomJobResult{}, err
	}

	return job, nil
}

// GetJobsByCreator возвращает список задач обработки DICOM-файлов, созданных пользователем с указанным ID.
func (s *Storage) GetJobsByCreator(
	ctx context.Context, creatorID int64, offset, limit uint64,
) ([]DicomJobResult, error) {
	const query = `select 
						job_id, dicom_file_id, job_status, anatomical_region, 
						confidence, violations, duration_ms, metadata, specialist_decision, 
						specialist_id,comment, created_at, updated_at 
					from dicom_job_result 
					where 
					    dicom_file_id in (select id from dicom_file where creator_id = $1)
					order by created_at desc
					offset $2 limit $3;`

	var jobs []DicomJobResult
	err := s.db.QuerySlice(ctx, &jobs, query, creatorID, offset, limit)
	if err != nil {
		return nil, err
	}

	return jobs, nil
}

// UpdateJobResultDecision обновляет решение специалиста по результату обработки DICOM-файла в БД.
func (s *Storage) UpdateJobResultDecision(ctx context.Context, data UpdateDecisionData) (rowsUpdated int64, err error) {
	baseQuery := sq.Update("dicom_job_result").
		Set("specialist_decision", data.SpecialistDecision).
		Set("specialist_id", data.SpecialistID).
		Set("comment", data.Comment).
		Set("updated_at", sq.Expr("now()")).
		Where(sq.Eq{"job_id": data.JobIDs})

	if data.CheckCreator {
		baseQuery = baseQuery.Where(
			sq.Expr(
				"dicom_file_id in (select id from dicom_file where creator_id = ?)",
				data.SpecialistID,
			),
		)
	}

	query, args, err := baseQuery.PlaceholderFormat(sq.Dollar).ToSql()
	if err != nil {
		return 0, err
	}

	return s.db.Exec(ctx, query, args...)
}
