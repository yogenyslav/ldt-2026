package get_paginated

import (
	"context"

	"github.com/rs/zerolog"
	storage "github.com/yogenyslav/ldt-2026/dicom-manager/internal/storage/job"
	"github.com/yogenyslav/ldt-2026/dicom-manager/pkg/observability"
)

type jobRepo interface {
	GetJobsByCreator(ctx context.Context, creatorID int64, offset, limit uint64) ([]storage.DicomJobResult, error)
}

// Usecase структура для реализации бизнес-логики получения пагинированного списка задач.
type Usecase struct {
	log     *zerolog.Logger
	metrics observability.MetricsClient
	jobRepo jobRepo
}

// New создает новый экземпляр Usecase.
func New(l *zerolog.Logger, m observability.MetricsClient, jobRepo jobRepo) *Usecase {
	return &Usecase{
		log:     l,
		metrics: m,
		jobRepo: jobRepo,
	}
}

// GetPaginated реализует бизнес-логику получения пагинированного списка задач.
func (uc *Usecase) GetPaginated(ctx context.Context, in GetJobsRequest) ([]Job, error) {
	uc.metrics.Counter("usecases.job.get_paginated.total").Inc()

	jobs, err := uc.jobRepo.GetJobsByCreator(ctx, in.CreatorID, in.Offset, in.Limit)
	if err != nil {
		uc.metrics.Counter("usecases.job.get_paginated.error").Inc()
		uc.log.Error().Err(err).Msg("failed to get jobs by IDs")
		return nil, err
	}

	res := make([]Job, 0, len(jobs))
	for _, j := range jobs {
		res = append(
			res, Job{
				ID:                 j.ID,
				DicomFileID:        j.DicomFileID,
				Status:             j.Status,
				AnatomicalRegion:   j.AnatomicalRegion,
				Confidence:         j.Confidence,
				Violations:         j.Violations,
				DurationMs:         j.DurationMs,
				Metadata:           j.Metadata,
				SpecialistDecision: j.SpecialistDecision,
				SpecialistID:       j.SpecialistID,
				Comment:            j.Comment,
				CreatedAt:          j.CreatedAt,
				UpdatedAt:          j.UpdatedAt,
			},
		)
	}

	uc.metrics.Counter("usecases.job.get_paginated.ok").Inc()
	return res, nil
}
