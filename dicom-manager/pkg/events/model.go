package events

import (
	"encoding/json"
	"time"
)

// Result результат анализа DICOM-файла в сообщении.
type Result struct {
	AnatomicalRegion string          `json:"anatomical_region"`
	Confidence       *float64        `json:"confidence"`
	Violations       []string        `json:"violations"`
	DurationMs       int64           `json:"duration_ms"`
	Metadata         json.RawMessage `json:"metadata"`
}

// Event событие обработки DICOM-файла по контракту первой версии.
type Event struct {
	Version    int       `json:"version"`
	EventID    string    `json:"event_id"`
	JobID      string    `json:"job_id"`
	DicomID    string    `json:"dicom_id"`
	Status     string    `json:"status"`
	OccurredAt time.Time `json:"occurred_at"`
	Result     *Result   `json:"result,omitempty"`
	Error      string    `json:"error,omitempty"`
}
