package generate

import (
	"bytes"
	"context"
	"encoding/csv"
	"testing"

	"github.com/stretchr/testify/require"
	storage "github.com/yogenyslav/ldt-2026/dicom-manager/internal/storage/report"
	"github.com/yogenyslav/ldt-2026/dicom-manager/internal/usecases/report/generate/wrappers"
)

type reportRepoStub struct {
	reportRepo
	results []storage.DicomResult
}

func (s reportRepoStub) GetDicomResultsForReport(context.Context, []string) ([]storage.DicomResult, error) {
	return s.results, nil
}

func TestBuildReportMetadataMapping(t *testing.T) {
	const original = "Ось позвоночника отклонена более чем на 5°"

	for _, tc := range []struct {
		name, metadata, region, violations string
	}{
		{"mapped", `{"anatomical_region":"Поясничный отдел позвоночника","violation_type":["Не выравнена ось позвоночника"]}`, "Поясничный отдел позвоночника", "Не выравнена ось позвоночника"},
		{"legacy", `{"shape":[100,200]}`, "Поясничный отдел позвоночника", original},
		{"missing metadata", "", "Поясничный отдел позвоночника", original},
		{"null fields", `{"anatomical_region":null,"violation_type":null}`, "Поясничный отдел позвоночника", original},
		{"invalid metadata", `{"anatomical_region":123}`, "Поясничный отдел позвоночника", original},
		{"region only", `{"anatomical_region":"Поясничный отдел позвоночника"}`, "Поясничный отдел позвоночника", original},
		{"violations only", `{"violation_type":["Не выравнена ось позвоночника"]}`, "Поясничный отдел позвоночника", "Не выравнена ось позвоночника"},
		{"empty mapped violations", `{"violation_type":[]}`, "Поясничный отдел позвоночника", ""},
		{"duplicates", `{"violation_type":["Некорректная укладка","Некорректная укладка"]}`, "Поясничный отдел позвоночника", "Некорректная укладка;Некорректная укладка"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			repo := reportRepoStub{results: []storage.DicomResult{{
				FileName: "patient/study/image.dcm", DicomStudyUid: "study", DicomImageUid: "image",
				AnatomicalRegion: "spine", Violations: []string{original},
				JobStatus: "completed", DurationMs: 1250, Metadata: []byte(tc.metadata),
			}}}
			uc := &Usecase{reportRepo: repo, reportBuilder: wrappers.NewReportBuilder()}
			content, err := uc.buildReport(context.Background(), []string{"job"})
			require.NoError(t, err)

			rows, err := csv.NewReader(bytes.NewReader(content)).ReadAll()
			require.NoError(t, err)
			require.Len(t, rows, 2)

			require.Equal(t, []string{"patient/study/image.dcm", "study", "image", tc.region, "1", tc.violations, "Success", "1.250000"}, rows[1])
			require.Equal(t, "spine", repo.results[0].AnatomicalRegion)
			require.Equal(t, []string{original}, repo.results[0].Violations)
			require.Equal(t, tc.metadata, string(repo.results[0].Metadata))
		})
	}
}

func TestBuildReportRegionFallback(t *testing.T) {
	for _, tc := range []struct {
		name, original, metadata, want string
	}{
		{"right hip legacy", "hip_right", `{"shape":[100,200]}`, "Проксимальный отдел бедра"},
		{"left hip missing metadata", "hip_left", "", "Проксимальный отдел бедра"},
		{"right hip null metadata", "hip_right", "null", "Проксимальный отдел бедра"},
		{"right hip invalid metadata", "hip_right", "{", "Проксимальный отдел бедра"},
		{"right hip mapped", "hip_right", `{"anatomical_region":"Проксимальный отдел бедра"}`, "Проксимальный отдел бедра"},
		{"metadata takes priority", "hip_right", `{"anatomical_region":"Уточненный регион"}`, "Уточненный регион"},
		{"unknown region", "unknown", "", "unknown"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			repo := reportRepoStub{results: []storage.DicomResult{{
				AnatomicalRegion: tc.original, Metadata: []byte(tc.metadata), JobStatus: "completed",
			}}}
			uc := &Usecase{reportRepo: repo, reportBuilder: wrappers.NewReportBuilder()}
			content, err := uc.buildReport(context.Background(), []string{"job"})
			require.NoError(t, err)
			rows, err := csv.NewReader(bytes.NewReader(content)).ReadAll()
			require.NoError(t, err)
			require.Len(t, rows, 2)
			require.Equal(t, tc.want, rows[1][3])
			require.Equal(t, tc.original, repo.results[0].AnatomicalRegion)
			require.Equal(t, tc.metadata, string(repo.results[0].Metadata))
		})
	}
}
