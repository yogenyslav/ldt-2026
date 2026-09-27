package result_decision

import (
	"context"
	"errors"

	"github.com/gofiber/fiber/v3"
	"github.com/rs/zerolog"
	"github.com/yogenyslav/ldt-2026/dicom-manager/internal/api/user/model"
	"github.com/yogenyslav/ldt-2026/dicom-manager/internal/usecases/job/decision"
	"github.com/yogenyslav/ldt-2026/dicom-manager/pkg/jwt"
	"github.com/yogenyslav/ldt-2026/dicom-manager/pkg/observability"
)

type usecase interface {
	UpdateDecision(ctx context.Context, in decision.UpdateDecisionRequest) error
}

// Handler обработчик для принятия решения по результатам обработки DICOM-файлов.
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

// ResultDecision обработчик для принятия решения по результатам обработки DICOM-файлов.
//
//	@Summary		Принять решение по результатам обработки DICOM-файлов.
//	@Description	Принять решение по результатам обработки DICOM-файлов по их ID.
//	@Tags			job
//	@Accept			json
//	@Produce		json
//	@Param			JobResultDecision	body		ResultDecisionIn	true	"Данные для принятия решения по результатам обработки DICOM-файлов"
//	@Success		204					{object}	string				"Решение по результатам обработки успешно принято."
//	@Failure		400					string		"Некорректный запрос."
//	@Failure		404					string		"Задачи не найдены."
//	@Failure		500					string		"Внутренняя ошибка сервера."
//	@Router			/job/result/decision [post]
func (h *Handler) ResultDecision(c fiber.Ctx) error {
	var in ResultDecisionIn
	if err := c.Bind().JSON(&in); err != nil {
		h.log.Warn().Err(err).Msg("failed to bind request")
		return fiber.NewError(fiber.StatusBadRequest, "invalid request body")
	}

	if err := validateIn(in); err != nil {
		h.log.Warn().Err(err).Msg("invalid request body")
		return err
	}

	tokenClaims := c.Locals("tokenClaims")
	if tokenClaims == nil {
		h.metrics.Counter("handler.job.result_decision.token_claim_nil").Inc()
		h.log.Warn().Msg("token_claim is nil")
		return fiber.NewError(fiber.StatusInternalServerError, "token_claim is nil")
	}

	claims, ok := tokenClaims.(jwt.TokenClaims)
	if !ok {
		h.metrics.Counter("handler.job.result_decision.token_claim_invalid").Inc()
		h.log.Warn().Msg("token_claim is invalid")
		return fiber.NewError(fiber.StatusInternalServerError, "token_claim is invalid")
	}

	req := decision.UpdateDecisionRequest{
		JobIDs:         in.JobIDs,
		ResultDecision: in.Decision,
		Comment:        in.Comment,
		SpecialistID:   claims.UserID,
		RequesterRole:  model.UserRole(claims.Role),
	}
	err := h.uc.UpdateDecision(c.Context(), req)
	if err != nil {
		if errors.Is(err, decision.ErrJobNotFound) {
			h.log.Warn().Err(err).Msg("jobs not found")
			return fiber.NewError(fiber.StatusNotFound, "jobs not found")
		}
		h.log.Error().Err(err).Msg("failed to update decision")
		return fiber.NewError(fiber.StatusInternalServerError, "failed to update decision")
	}

	return c.SendStatus(fiber.StatusNoContent)
}

func validateIn(in ResultDecisionIn) error {
	if len(in.JobIDs) == 0 {
		return fiber.NewError(fiber.StatusBadRequest, "at least 1 job_id is required")
	}
	if in.Decision == "" {
		return fiber.NewError(fiber.StatusBadRequest, "result_decision is required")
	}
	return nil
}
