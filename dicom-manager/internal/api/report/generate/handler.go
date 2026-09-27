package generate

import (
	"context"

	"github.com/gofiber/fiber/v3"
	"github.com/rs/zerolog"
	"github.com/yogenyslav/ldt-2026/dicom-manager/internal/usecases/report/generate"
	"github.com/yogenyslav/ldt-2026/dicom-manager/pkg/jwt"
	"github.com/yogenyslav/ldt-2026/dicom-manager/pkg/observability"
)

type usecase interface {
	GenerateReport(ctx context.Context, in generate.GenerateReportRequest) (int64, error)
}

// Handler обработчик для генерации отчета по результатам обработки DICOM-файлов.
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

// Generate обработчик для генерации отчета по результатам обработки DICOM-файлов.
//
//	@Summary		Сгенерировать отчет по результатам обработки DICOM-файлов.
//	@Description	Сгенерировать отчет по результатам обработки DICOM-файлов в формате .csv.
//	@Tags			report
//	@Accept			json
//	@Produce		json
//	@Param			ReportGenerateIn	body		GenerateIn	true	"ID для генерации отчета по результатам обработки DICOM-файлов"
//	@Success		200					{object}	GenerateOut	"Отчет по результатам обработки DICOM-файлов успешно сгенерирован."
//	@Failure		400					string		"Некорректный запрос."
//	@Failure		403					string		"Доступ запрещен."
//	@Failure		500					string		"Внутренняя ошибка сервера."
//	@Router			/report/generate [post]
func (h *Handler) Generate(c fiber.Ctx) error {
	var in GenerateIn
	if err := c.Bind().JSON(&in); err != nil {
		h.log.Warn().Err(err).Msg("failed to parse request body")
		return fiber.NewError(fiber.StatusBadRequest, "invalid request body")
	}

	if err := h.validateIn(in); err != nil {
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

	reportID, err := h.uc.GenerateReport(
		c.Context(), generate.GenerateReportRequest{
			JobIDs:    in.JobIDs,
			CreatorID: claims.UserID,
		},
	)
	if err != nil {
		h.log.Error().Err(err).Msg("failed to generate report")
		return fiber.NewError(fiber.StatusInternalServerError, "failed to generate report")
	}

	out := convertToOut(reportID)
	return c.Status(fiber.StatusOK).JSON(out)
}

func (h *Handler) validateIn(in GenerateIn) error {
	if len(in.JobIDs) == 0 {
		h.log.Warn().Msg("job_ids is empty")
		return fiber.NewError(fiber.StatusBadRequest, "job_ids is required")
	}
	return nil
}

func convertToOut(reportID int64) GenerateOut {
	return GenerateOut{
		ReportID: reportID,
	}
}
