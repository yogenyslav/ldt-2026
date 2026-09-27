package get_by_id

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/rs/zerolog"
	"github.com/yogenyslav/ldt-2026/dicom-manager/internal/api/user/model"
	dicomStorage "github.com/yogenyslav/ldt-2026/dicom-manager/internal/storage/dicom"
	storage "github.com/yogenyslav/ldt-2026/dicom-manager/internal/storage/job"
	"github.com/yogenyslav/ldt-2026/dicom-manager/pkg/observability"
)

var (
	// ErrDicomNotFound ошибка, возвращаемая, если DICOM-файл не найден.
	ErrDicomNotFound = errors.New("source dicom file of the job not found")
	// ErrDicomForbidden ошибка, возвращаемая, если DICOM-файл недоступен для пользователя.
	ErrDicomForbidden = errors.New("dicom file of the job is not accessible by the user")
	// ErrJobNotFound ошибка, возвращаемая, если задача не найдена.
	ErrJobNotFound = errors.New("job not found")
)

type jobRepo interface {
	GetByID(ctx context.Context, id string) (storage.DicomJobResult, error)
}

type dicomRepo interface {
	GetByID(ctx context.Context, id string) (dicomStorage.Dicom, error)
}

// Usecase структура для реализации бизнес-логики получения задачи по ID.
type Usecase struct {
	log       *zerolog.Logger
	metrics   observability.MetricsClient
	jobRepo   jobRepo
	dicomRepo dicomRepo
}

// New создает новый экземпляр Usecase.
func New(l *zerolog.Logger, m observability.MetricsClient, jobRepo jobRepo, dicomRepo dicomRepo) *Usecase {
	return &Usecase{
		log:       l,
		metrics:   m,
		jobRepo:   jobRepo,
		dicomRepo: dicomRepo,
	}
}

// GetByID реализует бизнес-логику получения задачи по ID.
func (uc *Usecase) GetByID(ctx context.Context, in GetJobRequest) (Job, error) {
	uc.metrics.Counter("usecases.job.get_by_id.total").Inc()

	job, err := uc.jobRepo.GetByID(ctx, in.JobID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			uc.metrics.Counter("usecases.job.get_by_id.not_found").Inc()
			uc.log.Warn().Msgf("job with ID %s not found", in.JobID)
			return Job{}, ErrJobNotFound
		}
		uc.metrics.Counter("usecases.job.get_by_id.error").Inc()
		uc.log.Error().Err(err).Msg("failed to get job by ID")
		return Job{}, err
	}

	dicom, err := uc.dicomRepo.GetByID(ctx, job.DicomFileID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			uc.metrics.Counter("usecases.job.get_by_id.not_found").Inc()
			uc.log.Warn().Msgf("dicom file with ID %s not found", job.DicomFileID)
			return Job{}, ErrDicomNotFound
		}
		uc.metrics.Counter("usecases.job.get_by_id.error").Inc()
		uc.log.Error().Err(err).Msg("failed to get dicom by ID")
		return Job{}, err
	}

	if dicom.CreatorID != in.RequesterID && in.RequesterRole != model.UserRoleAdmin {
		uc.metrics.Counter("usecases.job.get_by_id.error").Inc()
		uc.log.Warn().Msgf("access to source dicom file of the job %s is forbidden", in.JobID)
		return Job{}, ErrDicomForbidden
	}

	uc.metrics.Counter("usecases.job.get_by_id.ok").Inc()
	return Job{
		ID:                 job.ID,
		DicomFileID:        job.DicomFileID,
		Status:             job.Status,
		AnatomicalRegion:   job.AnatomicalRegion,
		Confidence:         job.Confidence,
		Violations:         job.Violations,
		DurationMs:         job.DurationMs,
		Metadata:           job.Metadata,
		SpecialistDecision: job.SpecialistDecision,
		SpecialistID:       job.SpecialistID,
		Comment:            job.Comment,
		CreatedAt:          job.CreatedAt,
		UpdatedAt:          job.UpdatedAt,
	}, nil
}
