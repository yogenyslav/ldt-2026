package annotation

import (
	"context"
	"encoding/json"

	sq "github.com/Masterminds/squirrel"
	"github.com/yogenyslav/ldt-2026/dicom-manager/pkg/database"
)

// Storage реализует хранение неизменяемых отправок разметки.
type Storage struct {
	db database.DB
}

// New создаёт репозиторий разметки.
func New(db database.DB) *Storage {
	return &Storage{db: db}
}

// LockJob проверяет организацию и сериализует отправки по одному снимку.
func (s *Storage) LockJob(ctx context.Context, jobID string, organizationID int64) (Job, error) {
	const query = `select j.metadata from dicom_job_result j
		join dicom_file d on d.id = j.dicom_file_id
		where j.job_id = $1 and d.organization_id = $2 for update of j`

	var job Job
	err := s.db.TxQueryRow(ctx, &job, query, jobID, organizationID)
	return job, err
}

const submissionColumns = `a.submission_id, a.organization_id, a.job_id, a.task, a.status,
	a.annotator_id, a.annotator_role, a.payload, a.supersedes,
	(select b.submission_id from annotation_submission b where b.supersedes = a.submission_id) as superseded_by`

// GetByID возвращает отправку только внутри организации.
func (s *Storage) GetByID(ctx context.Context, id string, organizationID int64) (Submission, error) {
	const query = `select ` + submissionColumns + ` from annotation_submission a
		where a.submission_id = $1 and a.organization_id = $2`

	var submission Submission
	err := s.db.TxQueryRow(ctx, &submission, query, id, organizationID)
	return submission, err
}

// Save сохраняет новую отправку, не изменяя предыдущие документы.
func (s *Storage) Save(ctx context.Context, in Submission) (int64, error) {
	const query = `insert into annotation_submission
		(submission_id, organization_id, job_id, task, status, annotator_id, annotator_role, payload, supersedes)
		values ($1, $2, $3, $4, $5, $6, $7, $8, $9) on conflict do nothing`

	return s.db.TxExec(ctx, query, in.SubmissionID, in.OrganizationID, in.JobID, in.Task,
		in.Status, in.AnnotatorID, in.AnnotatorRole, in.Payload, in.Supersedes)
}

// List возвращает страницу и размер всей выборки в одном снимке данных.
func (s *Storage) List(ctx context.Context, filter Filter) ([]Submission, int64, error) {
	base := sq.Select(submissionColumns).From("annotation_submission a").
		Where(sq.Eq{"a.organization_id": filter.OrganizationID})
	if filter.JobID != "" {
		base = base.Where(sq.Eq{"a.job_id": filter.JobID})
	}
	if filter.Status != "" {
		base = base.Where(sq.Eq{"a.status": filter.Status})
	}
	if filter.OnlyLatest {
		base = base.Where("not exists (select 1 from annotation_submission b where b.supersedes = a.submission_id)")
	}

	// Агрегация возвращает total даже для страницы за пределами выборки.
	filtered, args, err := base.Column("a.received_at").PlaceholderFormat(sq.Dollar).ToSql()
	if err != nil {
		return nil, 0, err
	}

	page, pageArgs, err := sq.Select("*").From("filtered").
		OrderBy("received_at desc", "submission_id desc").Limit(filter.Limit).Offset(filter.Offset).ToSql()
	if err != nil {
		return nil, 0, err
	}

	query := `with filtered as (` + filtered + `), page as (` + page + `)
		select coalesce(jsonb_agg(to_jsonb(page) - 'received_at' order by received_at desc, submission_id desc), '[]'::jsonb) as submissions,
		(select count(*) from filtered) as total from page`
	args = append(args, pageArgs...)
	var result struct {
		Submissions []byte `db:"submissions"`
		Total       int64  `db:"total"`
	}

	if err = s.db.QueryRow(ctx, &result, query, args...); err != nil {
		return nil, 0, err
	}

	submissions := make([]Submission, 0)
	err = json.Unmarshal(result.Submissions, &submissions)
	return submissions, result.Total, err
}

// TrainingCounts считает актуальные отправки, пригодные для будущего дообучения.
func (s *Storage) TrainingCounts(ctx context.Context, organizationID int64) ([]TrainingCount, error) {
	const query = `select a.task, count(*) as have from annotation_submission a
		where a.organization_id = $1 and a.status in ('done', 'uncertain')
		and not exists (select 1 from annotation_submission b where b.supersedes = a.submission_id)
		and (a.task = 'foreign_seg' or exists (
			select 1 from jsonb_array_elements(a.payload->'annotations'->a.task->'points') p
			where p->>'origin' in ('human', 'model_confirmed')
		)) group by a.task`

	counts := make([]TrainingCount, 0)
	err := s.db.QuerySlice(ctx, &counts, query, organizationID)
	return counts, err
}
