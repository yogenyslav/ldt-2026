package events

import (
	"encoding/json"
	"errors"
	"math"
	"strings"

	"github.com/google/uuid"
)

// Validate проверяет контракт события и нормализует необязательные поля результата.
func (event *Event) Validate(subject string) error {
	if event.Version != 1 || event.OccurredAt.IsZero() ||
		strings.TrimSpace(event.DicomID) == "" || len(event.DicomID) > 256 {
		return errors.New("invalid envelope")
	}

	for _, id := range []string{event.EventID, event.JobID} {
		parsed, err := uuid.Parse(id)
		if err != nil || parsed == uuid.Nil {
			return errors.New("invalid UUID")
		}
	}

	valid := (subject == AnalysisRequested && event.Status == StatusPending) ||
		(subject == AnalysisCompleted && event.Status == StatusCompleted) ||
		((subject == AnalysisFailed || subject == DocumentFailed) && event.Status == StatusFailed) ||
		(subject == DocumentUpdated && (event.Status == StatusRunning || event.Status == StatusCompleted))
	if !valid {
		return errors.New("subject/status mismatch")
	}

	if subject == AnalysisRequested {
		if _, err := ResolveSettings(event.Settings); err != nil {
			return err
		}
	}

	if event.Status == StatusFailed && strings.TrimSpace(event.Error) == "" {
		return errors.New("failure requires error")
	}

	if event.Status != StatusCompleted {
		if event.Result != nil {
			return errors.New("unexpected result")
		}
		return nil
	}

	result := event.Result
	if result == nil || strings.TrimSpace(result.AnatomicalRegion) == "" || result.Confidence == nil {
		return errors.New("missing result fields")
	}

	if math.IsNaN(*result.Confidence) || math.IsInf(*result.Confidence, 0) ||
		*result.Confidence < 0 || *result.Confidence > 1 ||
		result.DurationMs < 0 || result.DurationMs > math.MaxInt32 {
		return errors.New("invalid result values")
	}

	if result.Violations == nil {
		result.Violations = []string{}
	}

	if len(result.Metadata) == 0 {
		result.Metadata = json.RawMessage(`{}`)
	}

	var metadata map[string]json.RawMessage
	if err := json.Unmarshal(result.Metadata, &metadata); err != nil || metadata == nil {
		return errors.New("metadata must be an object")
	}

	return nil
}
