package get_by_id

import (
	"context"
	"errors"
	"strconv"

	"github.com/gofiber/fiber/v3"
	"github.com/rs/zerolog"
	"github.com/yogenyslav/ldt-2026/dicom-manager/internal/api/report/model"
	user_model "github.com/yogenyslav/ldt-2026/dicom-manager/internal/api/user/model"
	"github.com/yogenyslav/ldt-2026/dicom-manager/internal/usecases/report/get_by_id"
	"github.com/yogenyslav/ldt-2026/dicom-manager/pkg/jwt"
	"github.com/yogenyslav/ldt-2026/dicom-manager/pkg/observability"
)

type usecase interface {
	GetReportByID(ctx context.Context, in get_by_id.GetReportRequest) (get_by_id.ReportData, error)
}

// Handler обработчик для получения отчетов по результатам обработки DICOM-файлов.
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

// GetByID обработчик для получения отчета по результатам обработки DICOM-файлов.
//
//	@Summary		Получить отчет по результатам обработки DICOM-файлов.
//	@Description	Получить отчет по результатам обработки DICOM-файлов по ID.
//	@Tags			report
//	@Accept			json
//	@Produce		json
//	@Param			report_id	path		string		true	"ID отчета по результатам обработки DICOM-файлов"
//	@Success		200			{object}	GetByIDOut	"Отчет по результатам обработки DICOM-файлов успешно получены."
//	@Failure		400			string		"Некорректный запрос."
//	@Failure		403			string		"Доступ запрещен."
//	@Failure		404			string		"Отчет не найден."
//	@Failure		500			string		"Внутренняя ошибка сервера."
//	@Router			/report/{report_id} [get]
func (h *Handler) GetByID(c fiber.Ctx) error {
	reportIDRaw := c.Params("report_id")
	if reportIDRaw == "" {
		h.log.Warn().Msg("report_id is empty")
		return fiber.NewError(fiber.StatusBadRequest, "report_id is required")
	}

	reportID, err := strconv.ParseInt(reportIDRaw, 10, 64)
	if err != nil {
		h.log.Warn().Err(err).Msg("invalid report_id format")
		return fiber.NewError(fiber.StatusBadRequest, "invalid report_id format")
	}

	tokenClaims := c.Locals("tokenClaims")
	if tokenClaims == nil {
		h.metrics.Counter("handler.report.get_by_id.token_claim_nil").Inc()
		h.log.Warn().Msg("token_claim is nil")
		return fiber.NewError(fiber.StatusForbidden, "access denied")
	}

	claims, ok := tokenClaims.(jwt.TokenClaims)
	if !ok {
		h.metrics.Counter("handler.report.get_by_id.token_claim_invalid").Inc()
		h.log.Warn().Msg("token_claim is invalid")
		return fiber.NewError(fiber.StatusForbidden, "access denied")
	}

	in := get_by_id.GetReportRequest{
		ReportID:      reportID,
		RequesterID:   claims.UserID,
		RequesterRole: user_model.UserRole(claims.Role),
	}
	report, err := h.uc.GetReportByID(c.Context(), in)
	if err != nil {
		if errors.Is(err, get_by_id.ErrReportNotFound) {
			h.log.Warn().Err(err).Msg("report not found")
			return fiber.NewError(fiber.StatusNotFound, "report not found")
		}
		if errors.Is(err, get_by_id.ErrReportForbidden) {
			h.log.Warn().Err(err).Msg("report access forbidden")
			return fiber.NewError(fiber.StatusForbidden, "access denied")
		}
		h.log.Error().Err(err).Msg("failed to get report by id")
		return fiber.NewError(fiber.StatusInternalServerError, "failed to get report")
	}

	out := convertToOut(report)
	return c.Status(fiber.StatusOK).JSON(out)
}

func convertToOut(report get_by_id.ReportData) GetByIDOut {
	return GetByIDOut{
		Report: model.Report{
			ID:          report.ID,
			DownloadURL: report.PresignedURL,
			CreatedAt:   report.CreatedAt,
		},
	}
}
