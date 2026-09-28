package get_paginated

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/gofiber/fiber/v3"
	"github.com/rs/zerolog"
	"github.com/yogenyslav/ldt-2026/dicom-manager/internal/api/job/model"
	user_model "github.com/yogenyslav/ldt-2026/dicom-manager/internal/api/user/model"
	"github.com/yogenyslav/ldt-2026/dicom-manager/internal/usecases/job/get_paginated"
	"github.com/yogenyslav/ldt-2026/dicom-manager/pkg/jwt"
	"github.com/yogenyslav/ldt-2026/dicom-manager/pkg/observability"
)

type usecase interface {
	GetPaginated(ctx context.Context, in get_paginated.GetJobsRequest) ([]get_paginated.Job, error)
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

// GetPaginated обработчик для получения информации о задачах на обработку DICOM-файлов по их ID с пагинацией.
//
//	@Summary		Получить информацию о задачах на обработку DICOM-файлов по их ID с пагинацией
//	@Description	Получить информацию о задачах на обработку DICOM-файлов по их ID с пагинацией
//	@Tags			job
//	@Accept			json
//	@Produce		json
//	@Param			offset	query		int					false	"Offset для пагинации (по умолчанию 0)"
//	@Param			limit	query		int					false	"Limit для пагинации (по умолчанию 10)"
//	@Success		200		{object}	GetInfoPaginatedOut	"Информация о задачах успешно получена."
//	@Failure		400		string		"Некорректный запрос."
//	@Failure		500		string		"Внутренняя ошибка сервера."
//	@Router			/job/info [get]
func (h *Handler) GetPaginated(c fiber.Ctx) error {
	offset := fiber.Query[uint64](c, "offset", 0)
	limit := fiber.Query[uint64](c, "limit", 10)

	claims, ok := c.Locals("tokenClaims").(jwt.TokenClaims)
	if !ok {
		return fiber.NewError(fiber.StatusUnauthorized, "invalid token claims")
	}

	jobs, err := h.uc.GetPaginated(
		c.Context(), get_paginated.GetJobsRequest{
			CreatorID:      claims.UserID,
			OrganizationID: claims.OrganizationID,
			RequesterRole:  user_model.UserRole(claims.Role),
			Offset:         offset,
			Limit:          limit,
		},
	)
	if err != nil {
		h.log.Error().Err(err).Msg("failed to get paginated jobs")
		return fiber.NewError(fiber.StatusInternalServerError, "failed to get paginated jobs")
	}

	out, err := convertToOut(jobs)
	if err != nil {
		h.log.Error().Err(err).Msg("failed to convert jobs to output format")
		return fiber.NewError(fiber.StatusInternalServerError, "failed to convert jobs to output format")
	}

	return c.JSON(out)
}

func convertToOut(jobs []get_paginated.Job) (GetInfoPaginatedOut, error) {
	out := make([]model.JobInfo, 0, len(jobs))
	for _, job := range jobs {
		metadata := make(map[string]any)
		if err := json.Unmarshal(job.Metadata, &metadata); len(job.Metadata) > 0 && err != nil {
			return GetInfoPaginatedOut{}, fmt.Errorf("failed to unmarshal metadata: %w", err)
		}

		errorMessage, _ := metadata["error"].(string)

		var decision *model.Decision
		if job.SpecialistDecision != nil {
			decision = new(model.Decision(*job.SpecialistDecision))
		}

		out = append(
			out, model.JobInfo{
				Error:              errorMessage,
				ID:                 job.ID,
				DicomID:            job.DicomFileID,
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
		)
	}

	return GetInfoPaginatedOut{Jobs: out}, nil
}
