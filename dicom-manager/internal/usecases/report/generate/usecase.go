package generate

import (
	"context"
	"fmt"
	"strconv"

	"github.com/rs/zerolog"
	storage "github.com/yogenyslav/ldt-2026/dicom-manager/internal/storage/report"
	"github.com/yogenyslav/ldt-2026/dicom-manager/internal/usecases/report/generate/wrappers"
	"github.com/yogenyslav/ldt-2026/dicom-manager/internal/usecases/report/generate/wrappers/dto"
	"github.com/yogenyslav/ldt-2026/dicom-manager/pkg/database"
	"github.com/yogenyslav/ldt-2026/dicom-manager/pkg/observability"
)

type reportRepo interface {
	SaveReport(ctx context.Context, report storage.Report) (int64, error)
	GetDicomResultsForReport(ctx context.Context, jobIDs []string) ([]storage.DicomResult, error)
}

type fileStorage interface {
	PutObject(ctx context.Context, bucket, obj string, payload []byte) error
}

type reportBuilder interface {
	BuildReport(dicomResults []dto.JobResult) ([]byte, error)
}

// Usecase структура для реализации бизнес-логики генерации отчета.
type Usecase struct {
	log           *zerolog.Logger
	metrics       observability.MetricsClient
	uow           database.UnitOfWork
	reportRepo    reportRepo
	fileStorage   fileStorage
	reportBuilder reportBuilder
}

// New создает новый экземпляр Usecase.
func New(
	l *zerolog.Logger, m observability.MetricsClient, uow database.UnitOfWork,
	rr reportRepo, fs fileStorage,
) *Usecase {
	return &Usecase{
		log:           l,
		metrics:       m,
		uow:           uow,
		reportRepo:    rr,
		fileStorage:   fs,
		reportBuilder: wrappers.NewReportBuilder(),
	}
}

// GenerateReport реализует бизнес-логику генерации отчета.
func (uc *Usecase) GenerateReport(ctx context.Context, in GenerateReportRequest) (int64, error) {
	uc.metrics.Counter("usecases.report.generate.total").Inc()

	var (
		reportID      int64
		errSaveReport error
	)
	err := uc.uow.WithTx(
		ctx, database.TxLevelReadCommitted, func(ctx context.Context) error {
			reportID, errSaveReport = uc.reportRepo.SaveReport(
				ctx, storage.Report{
					DicomJobResultIDs: in.JobIDs,
					CreatorID:         in.CreatorID,
				},
			)
			if errSaveReport != nil {
				uc.metrics.Counter("usecases.report.generate.save_report_error").Inc()
				return fmt.Errorf("failed to save report: %w", errSaveReport)
			}

			reportContent, errBuildReport := uc.buildReport(ctx, in.JobIDs)
			if errBuildReport != nil {
				uc.metrics.Counter("usecases.report.generate.build_report_error").Inc()
				return fmt.Errorf("failed to build report: %w", errBuildReport)
			}

			errPutFile := uc.fileStorage.PutObject(
				ctx, "reports", strconv.FormatInt(reportID, 10), reportContent,
			)
			if errPutFile != nil {
				uc.metrics.Counter("usecases.report.generate.put_file_error").Inc()
				return fmt.Errorf("failed to put report file: %w", errPutFile)
			}

			return nil
		},
	)
	if err != nil {
		uc.metrics.Counter("usecases.report.generate.error").Inc()
		uc.log.Error().Err(err).Msg("failed to generate report")
		return 0, err
	}

	uc.metrics.Counter("usecases.report.generate.ok").Inc()
	return reportID, nil
}

func (uc *Usecase) buildReport(ctx context.Context, jobIDs []string) ([]byte, error) {
	dicomResults, err := uc.reportRepo.GetDicomResultsForReport(ctx, jobIDs)
	if err != nil {
		uc.metrics.Counter("usecases.report.generate.get_dicom_results_error").Inc()
		uc.log.Error().Err(err).Msg("failed to get dicom results for report")
		return nil, err
	}

	dtoResults := make([]dto.JobResult, len(dicomResults))
	for i, result := range dicomResults {
		var qualityClass int
		if len(result.Violations) > 0 {
			qualityClass = 1
		}

		dtoResults[i] = dto.JobResult{
			FileName:         result.FileName,
			DicomStudyUid:    result.DicomStudyUid,
			DicomImageUid:    result.DicomImageUid,
			AnatomicalRegion: result.AnatomicalRegion,
			QualityClass:     qualityClass,
			Violations:       result.Violations,
			JobStatus:        result.JobStatus,
			DurationSec:      result.DurationMs / 1000,
		}
	}

	reportContent, err := uc.reportBuilder.BuildReport(dtoResults)
	if err != nil {
		uc.metrics.Counter("usecases.report.generate.build_report_error").Inc()
		uc.log.Error().Err(err).Msg("failed to build report content")
		return nil, err
	}

	return reportContent, nil
}
