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

// JobFilter задаёт фильтры списка задач; источник хранится только в dicom_file.
type JobFilter struct {
	CreatorID       *int64
	OrganizationIDs []int64
	UploadSources   []string
	Offset, Limit   uint64
}

// GetJobs фильтрует задачи до применения пагинации.
func (s *Storage) GetJobs(ctx context.Context, filter JobFilter) ([]DicomJobResult, error) {
	query := sq.Select("j.job_id, j.dicom_file_id, j.job_status, j.anatomical_region, j.confidence, j.violations, j.duration_ms, j.metadata, j.specialist_decision, j.specialist_id, j.comment, j.created_at, j.updated_at, d.upload_source").From("dicom_job_result j").
		Join("dicom_file d on d.id = j.dicom_file_id").
		OrderBy("j.created_at desc", "j.job_id desc").Offset(filter.Offset).Limit(filter.Limit)
	if filter.CreatorID != nil {
		query = query.Where(sq.Eq{"d.creator_id": *filter.CreatorID})
	}
	if len(filter.OrganizationIDs) > 0 {
		query = query.Where(sq.Eq{"d.organization_id": filter.OrganizationIDs})
	}
	if len(filter.UploadSources) > 0 {
		query = query.Where(sq.Eq{"d.upload_source": filter.UploadSources})
	}
	sql, args, err := query.PlaceholderFormat(sq.Dollar).ToSql()
	if err != nil {
		return nil, err
	}
	jobs := make([]DicomJobResult, 0)
	err = s.db.QuerySlice(ctx, &jobs, sql, args...)
	return jobs, err
}

// GetJobsByCreator возвращает задачи файлов пользователя.
func (s *Storage) GetJobsByCreator(ctx context.Context, creatorID int64, offset, limit uint64) ([]DicomJobResult, error) {
	return s.GetJobs(ctx, JobFilter{CreatorID: &creatorID, Offset: offset, Limit: limit})
}

// GetJobsByOrganization возвращает задачи файлов организации.
func (s *Storage) GetJobsByOrganization(ctx context.Context, organizationID int64, offset, limit uint64) ([]DicomJobResult, error) {
	return s.GetJobs(ctx, JobFilter{OrganizationIDs: []int64{organizationID}, Offset: offset, Limit: limit})
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

// GetJobsByDicomID возвращает все попытки обработки файла, начиная с новых.
func (s *Storage) GetJobsByDicomID(ctx context.Context, dicomID string) ([]DicomJobResult, error) {
	const query = `select job_id, dicom_file_id, job_status, anatomical_region,
 confidence, violations, duration_ms, metadata, specialist_decision,
 specialist_id, comment, created_at, updated_at
 from dicom_job_result where dicom_file_id = $1
 order by created_at desc, job_id desc`
	jobs := make([]DicomJobResult, 0)
	err := s.db.QuerySlice(ctx, &jobs, query, dicomID)
	return jobs, err
}

// GetActiveDicomIDs возвращает ID файлов с незавершёнными задачами одним запросом.
// Вызывается после блокировки записей dicom_file в текущей транзакции.
func (s *Storage) GetActiveDicomIDs(ctx context.Context, dicomIDs []string) ([]string, error) {
	const query = `select distinct dicom_file_id from dicom_job_result
 where dicom_file_id = any($1::text[]) and job_status not in ('completed', 'failed')`
	var activeIDs []string
	err := s.db.TxQuerySlice(ctx, &activeIDs, query, dicomIDs)
	return activeIDs, err
}
