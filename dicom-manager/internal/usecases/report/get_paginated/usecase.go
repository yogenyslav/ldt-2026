package get_paginated

import (
	"context"
	"strconv"
	"time"

	"github.com/rs/zerolog"
	storage "github.com/yogenyslav/ldt-2026/dicom-manager/internal/storage/report"
	"github.com/yogenyslav/ldt-2026/dicom-manager/pkg/observability"
)

type reportRepo interface {
	GetByCreator(ctx context.Context, creatorID int64, offset, limit uint64) ([]storage.Report, error)
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

// GetPaginated реализует бизнес-логику получения отчетов по ID.
func (uc *Usecase) GetPaginated(ctx context.Context, in GetPaginatedRequest) ([]ReportData, error) {
	uc.metrics.Counter("usecases.report.get_paginated.total").Inc()

	reports, err := uc.reportRepo.GetByCreator(ctx, in.RequesterID, in.Offset, in.Limit)
	if err != nil {
		uc.metrics.Counter("usecases.report.get_paginated.error").Inc()
		uc.log.Error().Err(err).Msg("failed to get reports by creator")
		return nil, err
	}

	var reportDataList []ReportData
	for _, report := range reports {
		presignedURL, err := uc.fileStorage.PresignedGetObject(
			ctx, "reports", strconv.FormatInt(report.ID, 10), time.Hour,
		)
		if err != nil {
			uc.metrics.Counter("usecases.report.get_paginated.error").Inc()
			uc.log.Error().Err(err).Msg("failed to generate presigned URL for report")
			return nil, err
		}

		reportDataList = append(
			reportDataList, ReportData{
				ID:           report.ID,
				JobIDs:       report.DicomJobResultIDs,
				CreatorID:    report.CreatorID,
				CreatedAt:    report.CreatedAt,
				PresignedURL: presignedURL,
			},
		)
	}

	uc.metrics.Counter("usecases.report.get_paginated.ok").Inc()
	return reportDataList, nil
}
