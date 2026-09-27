package report

import (
	"context"

	"github.com/yogenyslav/ldt-2026/dicom-manager/pkg/database"
)

// Storage структура для работы с отчетами в БД.
type Storage struct {
	db database.DB
}

// New создает новый экземпляр репозитория отчетов.
func New(db database.DB) *Storage {
	return &Storage{db: db}
}

// SaveReport сохраняет отчет в БД.
func (s *Storage) SaveReport(ctx context.Context, report Report) (int64, error) {
	const query = `insert into report (dicom_job_result_ids, creator_id) values ($1, $2) returning id;`

	var reportID int64
	err := s.db.QueryRow(ctx, &reportID, query, report.DicomJobResultIDs, report.CreatorID)
	if err != nil {
		return 0, err
	}

	return reportID, nil
}

// GetByID возвращает отчет по его ID.
func (s *Storage) GetByID(ctx context.Context, id int64) (Report, error) {
	const query = `select id, dicom_job_result_ids, creator_id, created_at from report where id = $1;`

	var report Report
	err := s.db.QueryRow(ctx, &report, query, id)
	if err != nil {
		return Report{}, err
	}

	return report, nil
}

// GetByCreator возвращает список отчетов, созданных определенным пользователем.
func (s *Storage) GetByCreator(ctx context.Context, creatorID int64, offset, limit uint64) ([]Report, error) {
	const query = `select id, dicom_job_result_ids, creator_id, created_at 
					from report where creator_id = $1
					offset $2 limit $3;`

	var reports []Report
	err := s.db.QuerySlice(ctx, &reports, query, creatorID, offset, limit)
	if err != nil {
		return nil, err
	}

	return reports, nil
}

// GetDicomResultsForReport возвращает результаты обработки DICOM для отчета по списку job_id.
func (s *Storage) GetDicomResultsForReport(ctx context.Context, jobIDs []string) ([]DicomResult, error) {
	const query = `select
						d.file_name, d.dicom_study_uid, d.dicom_image_uid,
						j.job_status, j.anatomical_region, j.confidence, j.violations, j.duration_ms, j.metadata
					from dicom_job_result j
					join dicom_file d on j.dicom_file_id = d.id
					where 
					    j.job_id = any($1)
					    and j.job_status in ('completed', 'failed');`

	var results []DicomResult
	err := s.db.QuerySlice(ctx, &results, query, jobIDs)
	if err != nil {
		return nil, err
	}

	return results, nil
}
