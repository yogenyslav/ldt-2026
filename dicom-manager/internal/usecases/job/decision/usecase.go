package decision

import (
	"context"
	"errors"

	"github.com/rs/zerolog"
	user_model "github.com/yogenyslav/ldt-2026/dicom-manager/internal/api/user/model"
	storage "github.com/yogenyslav/ldt-2026/dicom-manager/internal/storage/job"
	"github.com/yogenyslav/ldt-2026/dicom-manager/pkg/observability"
)

var (
	// ErrJobNotFound ошибка, возвращаемая, если задача обработки DICOM-файла не найдена.
	ErrJobNotFound = errors.New("job not found")
)

type jobRepo interface {
	UpdateJobResultDecision(ctx context.Context, data storage.UpdateDecisionData) (rows int64, err error)
}

// Usecase структура для реализации бизнес-логики принятия решения по задаче обработки DICOM-файла.
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

// UpdateDecision реализует бизнес-логику принятия решения по задаче обработки DICOM-файла.
func (uc *Usecase) UpdateDecision(ctx context.Context, in UpdateDecisionRequest) error {
	uc.metrics.Counter("usecases.job.decision.update.total").Inc()

	checkCreator := in.RequesterRole == user_model.UserRoleSpecialist
	var comment string
	if in.Comment != nil {
		comment = *in.Comment
	}

	rowsUpdated, err := uc.jobRepo.UpdateJobResultDecision(
		ctx, storage.UpdateDecisionData{
			JobIDs:             in.JobIDs,
			SpecialistDecision: string(in.ResultDecision),
			Comment:            comment,
			SpecialistID:       in.SpecialistID,
			CheckCreator:       checkCreator,
		},
	)
	if err != nil {
		uc.metrics.Counter("usecases.job.decision.update.error").Inc()
		uc.log.Error().Err(err).Msg("failed to update job result decision")
		return err
	}

	if rowsUpdated == 0 {
		uc.metrics.Counter("usecases.job.decision.update.not_found").Inc()
		uc.log.Warn().Err(err).Msg("job not found")
		return ErrJobNotFound
	}

	if rowsUpdated < int64(len(in.JobIDs)) {
		uc.metrics.Counter("usecases.job.decision.update.partial").Inc()
		uc.log.Warn().Int("requested", len(in.JobIDs)).Int64("actual", rowsUpdated).Msg("jobs updated partially")
	}

	uc.metrics.Counter("usecases.job.decision.update.ok").Inc()
	return nil
}
