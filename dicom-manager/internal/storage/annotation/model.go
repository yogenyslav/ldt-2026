package annotation

import "encoding/json"

// Submission содержит сохранённый документ и серверные данные автора.
type Submission struct {
	SubmissionID   string          `db:"submission_id" json:"submission_id"`
	OrganizationID int64           `db:"organization_id" json:"organization_id"`
	JobID          string          `db:"job_id" json:"job_id"`
	Task           string          `db:"task" json:"task"`
	Status         string          `db:"status" json:"status"`
	AnnotatorID    int64           `db:"annotator_id" json:"annotator_id"`
	AnnotatorRole  string          `db:"annotator_role" json:"annotator_role"`
	Payload        json.RawMessage `db:"payload" json:"payload"`
	Supersedes     *string         `db:"supersedes" json:"supersedes"`
	SupersededBy   *string         `db:"superseded_by" json:"superseded_by"`
}

// Job содержит метаданные снимка для проверки системы координат.
type Job struct {
	Metadata []byte `db:"metadata"`
}

// Filter задаёт фильтры и границы страницы отправок.
type Filter struct {
	OrganizationID int64
	JobID          string
	Status         string
	OnlyLatest     bool
	Limit          uint64
	Offset         uint64
}

// TrainingCount содержит число пригодных отправок для одной задачи.
type TrainingCount struct {
	Task string `db:"task"`
	Have int64  `db:"have"`
}
