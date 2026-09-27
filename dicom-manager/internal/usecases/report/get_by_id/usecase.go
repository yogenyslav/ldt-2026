package get_by_id

import (
	"context"
	"errors"
	"strconv"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/rs/zerolog"
	"github.com/yogenyslav/ldt-2026/dicom-manager/internal/api/user/model"
	storage "github.com/yogenyslav/ldt-2026/dicom-manager/internal/storage/report"
	"github.com/yogenyslav/ldt-2026/dicom-manager/pkg/observability"
)

var (
	// ErrReportForbidden ошибка, возвращаемая при попытке доступа к отчету без соответствующих прав.
	ErrReportForbidden = errors.New("report access forbidden")
	// ErrReportNotFound ошибка, возвращаемая при попытке доступа к несуществующему отчету.
	ErrReportNotFound = errors.New("report not found")
)

type reportRepo interface {
	GetByID(ctx context.Context, reportID int64) (storage.Report, error)
}

type fileStorage interface {
	PresignedGetObject(ctx context.Context, bucket, obj string, exp time.Duration) (string, error)
}

// Usecase структура для реализации бизнес-логики получения отчета по ID.
type Usecase struct {
	log         *zerolog.Logger
	metrics     observability.MetricsClient
	reportRepo  reportRepo
	fileStorage fileStorage
}

// New создает новый экземпляр Usecase.
func New(l *zerolog.Logger, m observability.MetricsClient, rr reportRepo, fs fileStorage) *Usecase {
	return &Usecase{
		log:         l,
		metrics:     m,
		reportRepo:  rr,
		fileStorage: fs,
	}
}

// GetReportByID реализует бизнес-логику получения отчета по ID.
func (uc *Usecase) GetReportByID(ctx context.Context, in GetReportRequest) (ReportData, error) {
	uc.metrics.Counter("usecases.report.get_by_id.total").Inc()

	report, err := uc.reportRepo.GetByID(ctx, in.ReportID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			uc.metrics.Counter("usecases.report.get_by_id.not_found").Inc()
			uc.log.Warn().Err(err).Msg("report not found")
			return ReportData{}, ErrReportNotFound
		}
		uc.metrics.Counter("usecases.report.get_by_id.error").Inc()
		uc.log.Error().Err(err).Msg("failed to get report by ID")
		return ReportData{}, err
	}

	if report.CreatorID != in.RequesterID && in.RequesterRole != model.UserRoleAdmin {
		uc.metrics.Counter("usecases.report.get_by_id.forbidden").Inc()
		uc.log.Warn().Msg("report access forbidden")
		return ReportData{}, ErrReportForbidden
	}

	reportURL, err := uc.fileStorage.PresignedGetObject(
		ctx, "reports", strconv.FormatInt(report.ID, 10), 15*time.Minute,
	)
	if err != nil {
		uc.metrics.Counter("usecases.report.get_by_id.presigned_url_error").Inc()
		uc.log.Error().Err(err).Msg("failed to generate presigned URL for report")
		return ReportData{}, err
	}

	res := ReportData{
		ID:           report.ID,
		CreatorID:    report.CreatorID,
		JobIDs:       report.DicomJobResultIDs,
		CreatedAt:    report.CreatedAt,
		PresignedURL: reportURL,
	}

	uc.metrics.Counter("usecases.report.get_by_id.ok").Inc()
	return res, nil
}
