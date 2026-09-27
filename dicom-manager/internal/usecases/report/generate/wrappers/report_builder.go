package wrappers

import (
	"bytes"
	"encoding/csv"
	"fmt"

	"github.com/yogenyslav/ldt-2026/dicom-manager/internal/usecases/report/generate/wrappers/dto"
)

var (
	csvColumns = []string{
		"path_to_study",
		"study_uid",
		"image_uid",
		"anatomical_region",
		"quality_class",
		"violation_type",
		"processing_status",
		"time_of_processing",
	}
)

// ReportBuilder структура для построения отчета.
type ReportBuilder struct{}

// NewReportBuilder создает новый экземпляр ReportBuilder.
func NewReportBuilder() *ReportBuilder {
	return &ReportBuilder{}
}

// BuildReport строит отчет на основе предоставленных данных.
func (b *ReportBuilder) BuildReport(data []dto.JobResult) ([]byte, error) {
	var buf bytes.Buffer
	writer := csv.NewWriter(&buf)

	if err := writer.Write(csvColumns); err != nil {
		return nil, fmt.Errorf("failed to write CSV header: %w", err)
	}

	for _, record := range data {
		if err := writer.Write(
			[]string{
				record.FileName,
				record.DicomStudyUid,
				record.DicomImageUid,
				record.AnatomicalRegion,
				fmt.Sprintf("%d", record.QualityClass),
				fmt.Sprintf("%v", record.Violations),
				record.JobStatus,
				fmt.Sprintf("%d", record.DurationSec),
			},
		); err != nil {
			return nil, fmt.Errorf("failed to write CSV record: %w", err)
		}
	}

	writer.Flush()
	if err := writer.Error(); err != nil {
		return nil, fmt.Errorf("failed to flush CSV writer: %w", err)
	}

	return buf.Bytes(), nil
}
