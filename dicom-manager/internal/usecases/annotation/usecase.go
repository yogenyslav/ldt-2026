package annotation

import (
	"context"
	"encoding/json"
	"errors"
	"reflect"
	"strconv"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/rs/zerolog"
	"github.com/yogenyslav/ldt-2026/dicom-manager/internal/api/annotation/model"
	user_model "github.com/yogenyslav/ldt-2026/dicom-manager/internal/api/user/model"
	storage "github.com/yogenyslav/ldt-2026/dicom-manager/internal/storage/annotation"
	"github.com/yogenyslav/ldt-2026/dicom-manager/pkg/database"
	"github.com/yogenyslav/ldt-2026/dicom-manager/pkg/jwt"
	"github.com/yogenyslav/ldt-2026/dicom-manager/pkg/observability"
)

var (
	// ErrInvalid обозначает нарушение формата разметки.
	ErrInvalid = errors.New("Некорректная разметка")
	// ErrForbidden обозначает отсутствие прав администратора.
	ErrForbidden = errors.New("Разметка доступна только администратору")
	// ErrJobNotFound обозначает отсутствие снимка в организации пользователя.
	ErrJobNotFound = errors.New("Снимок не найден")
	// ErrCoordinates обозначает несовпадение размеров исходного кадра.
	ErrCoordinates = errors.New("Разметка пришла в другой системе координат")
	// ErrSuperseded обозначает конкурентное исправление разметки.
	ErrSuperseded = errors.New("Разметку успели поправить, откройте снимок заново")
	// ErrIDConflict обозначает повтор идентификатора с другими данными.
	ErrIDConflict = errors.New("Идентификатор отправки уже использован для другой разметки")
)

type annotationRepo interface {
	LockJob(ctx context.Context, jobID string, organizationID int64) (storage.Job, error)
	GetByID(ctx context.Context, id string, organizationID int64) (storage.Submission, error)
	Save(ctx context.Context, in storage.Submission) (int64, error)
	List(ctx context.Context, filter storage.Filter) ([]storage.Submission, int64, error)
	TrainingCounts(ctx context.Context, organizationID int64) ([]storage.TrainingCount, error)
}

// Usecase реализует приёмку разметки, её историю и заготовку дообучения.
type Usecase struct {
	log     *zerolog.Logger
	metrics observability.MetricsClient
	uow     database.UnitOfWork
	repo    annotationRepo
}

// New создаёт бизнес-логику разметки.
func New(l *zerolog.Logger, m observability.MetricsClient, uow database.UnitOfWork, repo annotationRepo) *Usecase {
	return &Usecase{
		log:     l,
		metrics: m,
		uow:     uow,
		repo:    repo,
	}
}

// Submit сохраняет отправку или подтверждает её идемпотентный повтор.
func (uc *Usecase) Submit(ctx context.Context, claims jwt.TokenClaims, in model.Submission) (out model.SubmitResponse, err error) {
	uc.metrics.Counter("usecases.annotation.submit.total").Inc()
	defer func() { uc.observe("submit", err) }()

	if err = authorize(claims); err != nil {
		return out, err
	}

	task, err := validateSubmission(in)
	if err != nil {
		return out, err
	}

	payload, err := json.Marshal(in)
	if err != nil {
		return out, err
	}

	err = uc.uow.WithTx(ctx, database.TxLevelReadCommitted, func(ctx context.Context) error {
		jobID := uuid.MustParse(in.JobID).String()
		job, err := uc.repo.LockJob(ctx, jobID, claims.OrganizationID)
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrJobNotFound
		}
		if err != nil {
			return err
		}

		previous, err := uc.repo.GetByID(ctx, in.SubmissionID, claims.OrganizationID)
		if err == nil {
			return sameSubmission(previous, in, claims)
		}
		if !errors.Is(err, pgx.ErrNoRows) {
			return err
		}

		var metadata struct {
			Shape []int `json:"shape"`
		}
		if err = json.Unmarshal(job.Metadata, &metadata); err != nil || len(metadata.Shape) != 2 ||
			metadata.Shape[0] != in.Image.Rows || metadata.Shape[1] != in.Image.Cols {
			return ErrCoordinates
		}

		if in.Supersedes != nil {
			previous, err = uc.repo.GetByID(ctx, *in.Supersedes, claims.OrganizationID)
			if errors.Is(err, pgx.ErrNoRows) {
				return invalid("Заменяемая отправка не найдена")
			}
			if err != nil {
				return err
			}
			if previous.JobID != jobID || previous.Task != task {
				return invalid("Заменяемая отправка относится к другому снимку или задаче")
			}
			if previous.SupersededBy != nil {
				return ErrSuperseded
			}
		}

		rows, err := uc.repo.Save(ctx, storage.Submission{
			SubmissionID:   in.SubmissionID,
			OrganizationID: claims.OrganizationID,
			JobID:          jobID,
			Task:           task,
			Status:         in.Status,
			AnnotatorID:    claims.UserID,
			AnnotatorRole:  claims.Role,
			Payload:        payload,
			Supersedes:     in.Supersedes,
		})
		if err != nil {
			return err
		}
		if rows == 0 {
			return ErrIDConflict
		}
		return nil
	})
	if err != nil {
		return out, err
	}

	return model.SubmitResponse{SubmissionID: in.SubmissionID, Warnings: []model.Warning{}}, nil
}

// List возвращает историю разметки в пределах организации из токена.
func (uc *Usecase) List(ctx context.Context, claims jwt.TokenClaims, filter storage.Filter) (out model.ListResponse, err error) {
	uc.metrics.Counter("usecases.annotation.list.total").Inc()
	defer func() { uc.observe("list", err) }()

	if err = authorize(claims); err != nil {
		return out, err
	}
	if filter.Limit < 1 || filter.Limit > 200 || (filter.Status != "" && !validStatus(filter.Status)) {
		return out, invalid("Некорректные параметры списка разметки")
	}
	if filter.JobID != "" {
		var jobID uuid.UUID
		if jobID, err = uuid.Parse(filter.JobID); err != nil {
			return out, invalid("Некорректный job_id")
		}
		filter.JobID = jobID.String()
	}
	filter.OrganizationID = claims.OrganizationID
	submissions, total, err := uc.repo.List(ctx, filter)
	if err != nil {
		return out, err
	}

	out.Submissions = make([]model.Record, 0, len(submissions))
	out.Total = total
	for _, submission := range submissions {
		var record model.Record
		if err = json.Unmarshal(submission.Payload, &record.Submission); err != nil {
			return out, err
		}
		record.Annotator = model.Annotator{ID: strconv.FormatInt(submission.AnnotatorID, 10), Role: submission.AnnotatorRole}
		record.SupersededBy = submission.SupersededBy
		out.Submissions = append(out.Submissions, record)
	}
	return out, nil
}

func sameSubmission(previous storage.Submission, in model.Submission, claims jwt.TokenClaims) error {
	var saved model.Submission
	if err := json.Unmarshal(previous.Payload, &saved); err != nil {
		return err
	}

	// Сравнение структуры JSON не зависит от порядка ключей и пробелов jsonb.
	var savedJSON, incomingJSON any
	savedBytes, err := json.Marshal(saved)
	if err != nil {
		return err
	}
	incomingBytes, err := json.Marshal(in)
	if err != nil {
		return err
	}

	if err = json.Unmarshal(savedBytes, &savedJSON); err != nil {
		return err
	}
	if err = json.Unmarshal(incomingBytes, &incomingJSON); err != nil {
		return err
	}

	if previous.AnnotatorID != claims.UserID || saved.DurationMs != in.DurationMs || !reflect.DeepEqual(savedJSON, incomingJSON) {
		return ErrIDConflict
	}

	return nil
}

func authorize(claims jwt.TokenClaims) error {
	if claims.Role != string(user_model.UserRoleAdmin) || claims.UserID <= 0 || claims.OrganizationID <= 0 {
		return ErrForbidden
	}
	return nil
}

func (uc *Usecase) observe(operation string, err error) {
	prefix := "usecases.annotation." + operation
	if err != nil {
		uc.metrics.Counter(prefix + ".error").Inc()
		uc.log.Warn().Err(err).Str("operation", operation).Msg("Не удалось выполнить операцию разметки")
		return
	}

	uc.metrics.Counter(prefix + ".ok").Inc()
}
