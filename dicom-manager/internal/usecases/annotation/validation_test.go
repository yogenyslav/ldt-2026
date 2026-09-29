package annotation

import (
	"encoding/json"
	"os"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
	"github.com/yogenyslav/ldt-2026/dicom-manager/internal/api/annotation/model"
)

func fixture(t *testing.T) model.Submission {
	t.Helper()
	data, err := os.ReadFile("testdata/submission.json")
	require.NoError(t, err)
	in, err := DecodeSubmission(data)
	require.NoError(t, err)
	return in
}

func TestValidateSubmission(t *testing.T) {
	for _, tc := range []struct {
		name   string
		change func(*model.Submission)
	}{
		{"version", func(in *model.Submission) { in.SchemaVersion = "2" }},
		{"ulid", func(in *model.Submission) { in.SubmissionID = "MG123ABC" }},
		{"ulid overflow", func(in *model.Submission) { in.SubmissionID = strings.Repeat("Z", 26) }},
		{"job", func(in *model.Submission) { in.JobID = "not-a-uuid" }},
		{"task", func(in *model.Submission) { in.TaskID += "x" }},
		{"duration", func(in *model.Submission) { in.DurationMs = -1 }},
		{"uncertain comment", func(in *model.Submission) { in.Status = "uncertain"; in.Comment = " \n" }},
		{"skipped comment", func(in *model.Submission) { in.Status = "skipped" }},
		{"status", func(in *model.Submission) { in.Status = "unknown" }},
		{"flags", func(in *model.Submission) { in.ImageFlags = []string{"unknown"} }},
		{"region", func(in *model.Submission) { in.Image.Region = "hip" }},
		{"image", func(in *model.Submission) { in.Image.Rows = 0 }},
		{"self supersedes", func(in *model.Submission) { in.Supersedes = &in.SubmissionID }},
		{"multiple tasks", func(in *model.Submission) { in.Annotations["foreign_seg"] = json.RawMessage(`{}`) }},
	} {
		t.Run(tc.name, func(t *testing.T) {
			in := fixture(t)
			tc.change(&in)
			_, err := validateSubmission(in)
			require.ErrorIs(t, err, ErrInvalid)
		})
	}
	for _, status := range []string{"done", "uncertain", "skipped"} {
		in := fixture(t)
		in.Status, in.Comment = status, "Комментарий"
		task, err := validateSubmission(in)
		require.NoError(t, err)
		require.Equal(t, "hip_keypoints", task)
	}
}

func TestRequiredFields(t *testing.T) {
	data, err := os.ReadFile("testdata/submission.json")
	require.NoError(t, err)
	var fields map[string]json.RawMessage
	require.NoError(t, json.Unmarshal(data, &fields))
	for name := range fields {
		t.Run(name, func(t *testing.T) {
			var body map[string]json.RawMessage
			require.NoError(t, json.Unmarshal(data, &body))
			delete(body, name)
			encoded, err := json.Marshal(body)
			require.NoError(t, err)
			_, err = DecodeSubmission(encoded)
			require.ErrorIs(t, err, ErrInvalid)
		})
	}
	for _, body := range []string{`null`, `{`, `[]`, strings.Replace(string(data), `"duration_ms": 18400`, `"duration_ms": null`, 1)} {
		_, err := DecodeSubmission([]byte(body))
		require.ErrorIs(t, err, ErrInvalid)
	}
}

func TestPointValidation(t *testing.T) {
	for _, tc := range []struct{ old, new string }{
		{`196.4`, `280`}, {`88.1`, `263`}, {`196.4`, `-0.1`},
		{`"present": true`, `"present": null`},
		{`"x": 196.4`, `"x": null`},
		{`"x": null`, `"x": 0`},
		{`"x": null,`, ``},
		{`"origin": "human"`, `"origin": "unknown"`},
		{`greater_trochanter_apex`, `ischium`},
	} {
		in := fixture(t)
		in.Annotations["hip_keypoints"] = json.RawMessage(strings.Replace(string(in.Annotations["hip_keypoints"]), tc.old, tc.new, 1))
		_, err := validateSubmission(in)
		require.ErrorIs(t, err, ErrInvalid, "%s -> %s", tc.old, tc.new)
	}
	data := []byte(`{"points":[{"name":"crest_left","present":false,"x":null,"y":null,"origin":"human"},{"name":"crest_right","present":true,"x":279,"y":262,"origin":"model"}]}`)
	require.NoError(t, validatePoints(data, fixture(t).Image, []string{"crest_left", "crest_right"}))
}

func TestSegmentationValidation(t *testing.T) {
	for _, tc := range []struct {
		body  string
		valid bool
	}{
		{`{"polygons":[],"verdict":"чисто"}`, true},
		{`{"polygons":[{"cls":"wire","points":[[0,0],[279,0],[0,262]]}],"verdict":"ПРЕДМЕТ"}`, true},
		{`{"polygons":null,"verdict":"чисто"}`, false},
		{`{"polygons":[],"verdict":"unknown"}`, false},
		{`{"polygons":[{"cls":"wire","points":[[0,0],[1,1]]}],"verdict":"проверить"}`, false},
		{`{"polygons":[{"cls":"wire","points":[[0,0],[1,1],[0,0]]}],"verdict":"проверить"}`, false},
		{`{"polygons":[{"cls":"wire","points":[[0,0],[1,1],[280,0]]}],"verdict":"проверить"}`, false},
		{`{"polygons":[{"cls":"wire","points":[[0,0],[1,1],[null,0]]}],"verdict":"проверить"}`, false},
		{`{"polygons":[{"cls":"wire","points":[[0,0],[1,1],[1,2,3]]}],"verdict":"проверить"}`, false},
	} {
		err := validateSegmentation([]byte(tc.body), fixture(t).Image)
		if tc.valid {
			require.NoError(t, err)
		} else {
			require.ErrorIs(t, err, ErrInvalid)
		}
	}
}
