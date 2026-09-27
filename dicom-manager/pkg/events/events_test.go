package events

import (
	"encoding/json"
	"errors"
	"testing"

	"github.com/google/uuid"
)

func TestDecode(t *testing.T) {
	confidence := 0.9
	valid := New(uuid.NewString(), "orthanc-instance-not-a-uuid", "completed")
	valid.Result = &Result{AnatomicalRegion: "spine", Confidence: &confidence, Metadata: json.RawMessage(`{"model":"v1"}`)}
	for _, tc := range []struct {
		name    string
		change  func(*Event)
		subject string
		invalid bool
	}{
		{"completed", func(*Event) {}, AnalysisCompleted, false},
		{"notification", func(*Event) {}, DocumentUpdated, false},
		{"wrong subject", func(*Event) {}, AnalysisFailed, true},
		{"unknown version", func(e *Event) { e.Version = 2 }, AnalysisCompleted, true},
		{"missing job", func(e *Event) { e.JobID = "" }, AnalysisCompleted, true},
		{"missing event", func(e *Event) { e.EventID = "" }, AnalysisCompleted, true},
		{"missing dicom", func(e *Event) { e.DicomID = " " }, AnalysisCompleted, true},
		{"missing result", func(e *Event) { e.Result = nil }, AnalysisCompleted, true},
		{"missing confidence", func(e *Event) { e.Result.Confidence = nil }, AnalysisCompleted, true},
		{"bad confidence", func(e *Event) { v := 1.1; e.Result.Confidence = &v }, AnalysisCompleted, true},
		{"bad duration", func(e *Event) { e.Result.DurationMs = -1 }, AnalysisCompleted, true},
		{"bad metadata", func(e *Event) { e.Result.Metadata = json.RawMessage(`[]`) }, AnalysisCompleted, true},
		{"null metadata", func(e *Event) { e.Result.Metadata = json.RawMessage(`null`) }, AnalysisCompleted, true},
		{"failed", func(e *Event) { e.Status = "failed"; e.Result = nil; e.Error = "model unavailable" }, AnalysisFailed, false},
		{"failure without reason", func(e *Event) { e.Status = "failed"; e.Result = nil }, AnalysisFailed, true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			e := valid
			result := *valid.Result
			e.Result = &result
			tc.change(&e)
			data, err := json.Marshal(e)
			if err != nil {
				t.Fatal(err)
			}
			_, err = Decode(tc.subject, data)
			if errors.Is(err, ErrInvalidEvent) != tc.invalid {
				t.Fatalf("invalid=%v, error=%v", tc.invalid, err)
			}
		})
	}
	if _, err := Decode(AnalysisCompleted, []byte(`{`)); !errors.Is(err, ErrInvalidEvent) {
		t.Fatal("malformed JSON accepted")
	}
}
