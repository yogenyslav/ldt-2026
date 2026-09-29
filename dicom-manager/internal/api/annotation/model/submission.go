package model

import (
	"encoding/json"
	"time"
)

// Submission неизменяемая отправка разметки одного снимка по одной задаче.
type Submission struct {
	SchemaVersion string                     `json:"schema_version"`
	SubmissionID  string                     `json:"submission_id"`
	TaskID        string                     `json:"task_id"`
	JobID         string                     `json:"job_id"`
	Image         Image                      `json:"image"`
	CreatedAt     time.Time                  `json:"created_at"`
	DurationMs    int64                      `json:"duration_ms"`
	ImageFlags    []string                   `json:"image_flags"`
	Status        string                     `json:"status"`
	Comment       string                     `json:"comment"`
	Annotations   map[string]json.RawMessage `json:"annotations" swaggertype:"object"`
	Supersedes    *string                    `json:"supersedes"`
}

// Image задаёт систему координат исходного кадра.
type Image struct {
	Rows   int    `json:"rows"`
	Cols   int    `json:"cols"`
	Region string `json:"region"`
}

// Point содержит положение точки и источник разметки.
type Point struct {
	Name    string   `json:"name"`
	Present *bool    `json:"present"`
	X       *float64 `json:"x"`
	Y       *float64 `json:"y"`
	Origin  string   `json:"origin"`
}

// Points содержит точки в порядке, заданном контрактом задачи.
type Points struct {
	Points []Point `json:"points"`
}

// Polygon содержит контур постороннего предмета.
type Polygon struct {
	Class  string       `json:"cls"`
	Points [][]*float64 `json:"points"`
}

// Segmentation содержит контуры и вердикт по посторонним предметам.
type Segmentation struct {
	Polygons []Polygon `json:"polygons"`
	Verdict  string    `json:"verdict"`
}

// Annotator заполняется сервером из данных авторизации.
type Annotator struct {
	ID   string `json:"id"`
	Role string `json:"role"`
}

// Record содержит отправку вместе с автором и ссылкой на исправление.
type Record struct {
	Submission
	Annotator    Annotator `json:"annotator"`
	SupersededBy *string   `json:"superseded_by"`
}

// Warning содержит необязательное замечание приёмки.
type Warning struct {
	Code string `json:"code"`
	Item string `json:"item"`
}

// SubmitResponse подтверждает сохранение отправки.
type SubmitResponse struct {
	SubmissionID string    `json:"submission_id"`
	Warnings     []Warning `json:"warnings"`
}

// ListResponse содержит страницу отправок и общее число записей.
type ListResponse struct {
	Submissions []Record `json:"submissions"`
	Total       int64    `json:"total"`
}
