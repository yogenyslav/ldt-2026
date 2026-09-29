package get_by_id

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/gofiber/fiber/v3"
	"github.com/rs/zerolog"
	"github.com/yogenyslav/ldt-2026/dicom-manager/internal/api/job/model"
	"github.com/yogenyslav/ldt-2026/dicom-manager/internal/api/job/query"
	user_model "github.com/yogenyslav/ldt-2026/dicom-manager/internal/api/user/model"
	"github.com/yogenyslav/ldt-2026/dicom-manager/internal/usecases/job/get_by_id"
	"github.com/yogenyslav/ldt-2026/dicom-manager/pkg/jwt"
	"github.com/yogenyslav/ldt-2026/dicom-manager/pkg/observability"
)

type usecase interface {
	GetByID(ctx context.Context, in get_by_id.GetJobRequest) (get_by_id.Job, error)
}

// Handler обработчик для получения информации о задаче на обработку DICOM-файлов батчем.
type Handler struct {
	log     *zerolog.Logger
	metrics observability.MetricsClient
	uc      usecase
}

// New создает новый экземпляр Handler.
func New(log *zerolog.Logger, metrics observability.MetricsClient, uc usecase) *Handler {
	return &Handler{
		log:     log,
		metrics: metrics,
		uc:      uc,
	}
}

// GetByID обработчик для получения информации о задаче на обработку DICOM-файла по ID.
//
//	@Summary		Получить информацию о задаче на обработку DICOM-файла по ID
//	@Description	Получить задачу по ID вместе с upload_source. При несовпадении organization_ids или upload_source возвращается 404.
//	@Tags			job
//	@Accept			json
//	@Produce		json
//	@Param			job_id				path		string		true	"ID задачи на обработку DICOM-файла"
//	@Param			organization_ids	query		[]int64		false	"ID организаций через запятую"				collectionFormat(csv)
//	@Param			upload_source		query		[]string	false	"Источники загрузки DICOM через запятую"	Enums(manual,clinic)	collectionFormat(csv)
//	@Success		200					{object}	GetByIDOut	"Информация о задаче успешно получена."
//	@Failure		400					string		"Некорректный запрос."
//	@Failure		403					string		"Доступ запрещен."
//	@Failure		404					string		"Задача не найдена."
//	@Failure		500					string		"Внутренняя ошибка сервера."
//	@Router			/job/info/{job_id} [get]
func (h *Handler) GetByID(c fiber.Ctx) error {
	jobID := c.Params("job_id")
	if jobID == "" {
		h.log.Warn().Msg("job_id is empty")
		return fiber.NewError(fiber.StatusBadRequest, "job_id is required")
	}

	tokenClaims := c.Locals("tokenClaims")
	if tokenClaims == nil {
		h.metrics.Counter("handler.job.get_by_id.token_claim_nil").Inc()
		h.log.Warn().Msg("token_claim is nil")
		return fiber.NewError(fiber.StatusInternalServerError, "token_claim is nil")
	}

	claims, ok := tokenClaims.(jwt.TokenClaims)
	if !ok {
		h.metrics.Counter("handler.job.get_by_id.token_claim_invalid").Inc()
		h.log.Warn().Msg("token_claim is invalid")
		return fiber.NewError(fiber.StatusInternalServerError, "token_claim is invalid")
	}

	organizationIDs, sources, err := query.ParseFilters(c)
	if err != nil {
		return err
	}

	req := get_by_id.GetJobRequest{
		OrganizationIDs: organizationIDs, UploadSources: sources,
		JobID:         jobID,
		RequesterID:   claims.UserID,
		RequesterRole: user_model.UserRole(claims.Role),
	}

	job, err := h.uc.GetByID(c.Context(), req)
	if err != nil {
		if errors.Is(err, get_by_id.ErrDicomNotFound) {
			h.metrics.Counter("handler.job.get_by_id.not_found").Inc()
			h.log.Error().Err(err).Msg("job's dicom not found")
			return fiber.NewError(fiber.StatusInternalServerError, "job cant be loaded because dicom file not found")
		}
		if errors.Is(err, get_by_id.ErrJobNotFound) {
			h.metrics.Counter("handler.job.get_by_id.not_found").Inc()
			h.log.Warn().Err(err).Msg("job not found")
			return fiber.NewError(fiber.StatusNotFound, "job not found")
		}
		if errors.Is(err, get_by_id.ErrDicomForbidden) {
			h.metrics.Counter("handler.job.get_by_id.forbidden").Inc()
			h.log.Warn().Err(err).Msg("job's dicom forbidden")
			return fiber.NewError(fiber.StatusForbidden, "job's dicom forbidden")
		}
		h.log.Error().Err(err).Msg("failed to get job by id")
		return fiber.NewError(fiber.StatusInternalServerError, "failed to get job by id")
	}

	out, err := convertToOut(job)
	if err != nil {
		h.log.Error().Err(err).Msg("failed to convert job to output format")
		return fiber.NewError(fiber.StatusInternalServerError, "failed to convert job to output format")
	}

	return c.Status(fiber.StatusOK).JSON(out)
}

func convertToOut(job get_by_id.Job) (GetByIDOut, error) {
	metadata := make(map[string]any)
	if err := json.Unmarshal(job.Metadata, &metadata); len(job.Metadata) > 0 && err != nil {
		return GetByIDOut{}, fmt.Errorf("failed to unmarshal metadata: %w", err)
	}

	errorMessage, _ := metadata["error"].(string)

	var decision *model.Decision
	if job.SpecialistDecision != nil {
		decision = new(model.Decision(*job.SpecialistDecision))
	}

	return GetByIDOut{
		Job: model.JobInfo{
			Error:              errorMessage,
			ID:                 job.ID,
			DicomID:            job.DicomFileID,
			UploadSource:       job.UploadSource,
			Status:             model.ToJobStatus(job.Status),
			AnatomicalRegion:   job.AnatomicalRegion,
			Confidence:         job.Confidence,
			Violations:         job.Violations,
			DurationMs:         job.DurationMs,
			Metadata:           metadata,
			SpecialistID:       job.SpecialistID,
			SpecialistDecision: decision,
			Comment:            job.Comment,
			CreatedAt:          job.CreatedAt,
			UpdatedAt:          job.UpdatedAt,
		},
	}, nil
}
