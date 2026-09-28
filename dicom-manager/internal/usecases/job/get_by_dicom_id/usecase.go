package get_by_dicom_id

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/rs/zerolog"
	"github.com/yogenyslav/ldt-2026/dicom-manager/internal/api/user/model"
	dicomstorage "github.com/yogenyslav/ldt-2026/dicom-manager/internal/storage/dicom"
	storage "github.com/yogenyslav/ldt-2026/dicom-manager/internal/storage/job"
	"github.com/yogenyslav/ldt-2026/dicom-manager/pkg/observability"
)

var (
	// ErrDicomNotFound означает, что запрошенный файл отсутствует.
	ErrDicomNotFound = errors.New("dicom file not found")

	// ErrDicomForbidden означает отсутствие доступа к файлу.
	ErrDicomForbidden = errors.New("dicom file is not accessible by the user")
)

type jobRepo interface {
	GetJobsByDicomID(ctx context.Context, dicomID string) ([]storage.DicomJobResult, error)
}

type dicomRepo interface {
	GetByID(ctx context.Context, id string) (dicomstorage.Dicom, error)
}

// Usecase структура для реализации бизнес-логики получения списка задач одного DICOM-файла.
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

// GetByDicomID реализует бизнес-логику получения списка задач одного DICOM-файла.
func (uc *Usecase) GetByDicomID(ctx context.Context, in GetJobsRequest) ([]Job, error) {
	uc.metrics.Counter("usecases.job.get_by_dicom_id.total").Inc()

	dicom, err := uc.dicomRepo.GetByID(ctx, in.DicomID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrDicomNotFound
		}
		return nil, err
	}

	if dicom.CreatorID != in.RequesterID && in.RequesterRole != model.UserRoleAdmin {
		return nil, ErrDicomForbidden
	}

	jobs, err := uc.jobRepo.GetJobsByDicomID(ctx, in.DicomID)
	if err != nil {
		uc.metrics.Counter("usecases.job.get_by_dicom_id.error").Inc()
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

	uc.metrics.Counter("usecases.job.get_by_dicom_id.ok").Inc()
	return res, nil
}
