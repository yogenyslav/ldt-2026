package get_by_dicom_id

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"

	usermodel "github.com/yogenyslav/ldt-2026/dicom-manager/internal/api/user/model"

	"github.com/gofiber/fiber/v3"
	"github.com/rs/zerolog"
	"github.com/yogenyslav/ldt-2026/dicom-manager/internal/api/job/model"
	"github.com/yogenyslav/ldt-2026/dicom-manager/internal/api/job/query"
	"github.com/yogenyslav/ldt-2026/dicom-manager/internal/usecases/job/get_by_dicom_id"
	"github.com/yogenyslav/ldt-2026/dicom-manager/pkg/jwt"
	"github.com/yogenyslav/ldt-2026/dicom-manager/pkg/observability"
)

type usecase interface {
	GetByDicomID(ctx context.Context, in get_by_dicom_id.GetJobsRequest) ([]get_by_dicom_id.Job, error)
}

// Handler обработчик получения всех задач одного DICOM-файла.
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

// GetByDicomID возвращает все задачи обработки одного DICOM-файла.
//
//	@Summary		Получить все задачи DICOM-файла
//	@Description	Возвращает все попытки обработки от новых к старым. Доступ разрешён владельцу файла и администратору. Каждая задача содержит upload_source; при несовпадении фильтров возвращается пустой список.
//	@Tags			job
//	@Produce		json
//	@Param			dicom_id			path		string			true	"ID DICOM-файла"
//	@Param			organization_ids	query		[]int64			false	"ID организаций через запятую"				collectionFormat(csv)
//	@Param			upload_source		query		[]string		false	"Источники загрузки DICOM через запятую"	Enums(manual,clinic)	collectionFormat(csv)
//	@Success		200					{object}	GetByDicomIDOut	"Список задач"
//	@Failure		400					{string}	string			"Некорректные фильтры."
//	@Failure		401					{string}	string			"Требуется авторизация."
//	@Failure		403					{string}	string			"Доступ запрещён."
//	@Failure		404					{string}	string			"DICOM-файл не найден."
//	@Failure		500					{string}	string			"Внутренняя ошибка сервера."
//	@Router			/dicom/{dicom_id}/jobs [get]
func (h *Handler) GetByDicomID(c fiber.Ctx) error {
	dicomID := c.Params("dicom_id")

	claims, ok := c.Locals("tokenClaims").(jwt.TokenClaims)
	if !ok {
		return fiber.NewError(fiber.StatusUnauthorized, "invalid token claims")
	}

	organizationIDs, sources, err := query.ParseFilters(c)
	if err != nil {
		return err
	}

	jobs, err := h.uc.GetByDicomID(
		c.Context(), get_by_dicom_id.GetJobsRequest{
			OrganizationIDs: organizationIDs, UploadSources: sources,
			DicomID:       dicomID,
			RequesterID:   claims.UserID,
			RequesterRole: usermodel.UserRole(claims.Role),
		},
	)
	if err != nil {
		if errors.Is(err, get_by_dicom_id.ErrDicomNotFound) {
			return fiber.NewError(fiber.StatusNotFound, "dicom file not found")
		}
		if errors.Is(err, get_by_dicom_id.ErrDicomForbidden) {
			return fiber.NewError(fiber.StatusForbidden, "access denied")
		}
		h.log.Error().Err(err).Msg("failed to get DICOM jobs")
		return fiber.NewError(fiber.StatusInternalServerError, "failed to get DICOM jobs")
	}

	out, err := convertToOut(jobs)
	if err != nil {
		h.log.Error().Err(err).Msg("failed to convert jobs to output format")
		return fiber.NewError(fiber.StatusInternalServerError, "failed to convert jobs to output format")
	}

	return c.JSON(out)
}

func convertToOut(jobs []get_by_dicom_id.Job) (GetByDicomIDOut, error) {
	out := make([]model.JobInfo, 0, len(jobs))
	for _, job := range jobs {
		metadata := make(map[string]any)
		if err := json.Unmarshal(job.Metadata, &metadata); len(job.Metadata) > 0 && err != nil {
			return GetByDicomIDOut{}, fmt.Errorf("failed to unmarshal metadata: %w", err)
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
		)
	}

	return GetByDicomIDOut{Jobs: out}, nil
}
