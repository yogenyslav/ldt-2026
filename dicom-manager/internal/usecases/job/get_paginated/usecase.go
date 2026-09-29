package get_paginated

import (
	"context"

	"github.com/rs/zerolog"
	"github.com/yogenyslav/ldt-2026/dicom-manager/internal/api/user/model"
	storage "github.com/yogenyslav/ldt-2026/dicom-manager/internal/storage/job"
	"github.com/yogenyslav/ldt-2026/dicom-manager/pkg/observability"
)

type jobRepo interface {
	GetJobs(ctx context.Context, filter storage.JobFilter) ([]storage.DicomJobResult, error)
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

	filter := storage.JobFilter{OrganizationIDs: in.OrganizationIDs, UploadSources: in.UploadSources, Offset: in.Offset, Limit: in.Limit}
	if in.RequesterRole == model.UserRoleAdmin {
		if len(filter.OrganizationIDs) == 0 {
			filter.OrganizationIDs = []int64{in.OrganizationID}
		}
	} else {
		filter.CreatorID = &in.CreatorID
	}
	jobs, err := uc.jobRepo.GetJobs(ctx, filter)
	if err != nil {
		uc.metrics.Counter("usecases.job.get_paginated.error").Inc()
		uc.log.Error().Err(err).Msg("failed to get paginated jobs")
		return nil, err
	}

	res := make([]Job, 0, len(jobs))
	for _, j := range jobs {
		res = append(
			res, Job{
				UploadSource:       j.UploadSource,
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
