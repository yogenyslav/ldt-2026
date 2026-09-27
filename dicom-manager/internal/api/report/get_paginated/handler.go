package get_paginated

import (
	"context"

	"github.com/gofiber/fiber/v3"
	"github.com/rs/zerolog"
	"github.com/yogenyslav/ldt-2026/dicom-manager/internal/api/report/model"
	"github.com/yogenyslav/ldt-2026/dicom-manager/internal/usecases/report/get_paginated"
	"github.com/yogenyslav/ldt-2026/dicom-manager/pkg/jwt"
	"github.com/yogenyslav/ldt-2026/dicom-manager/pkg/observability"
)

type usecase interface {
	GetPaginated(ctx context.Context, in get_paginated.GetPaginatedRequest) ([]get_paginated.ReportData, error)
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

// GetPaginated обработчик для получения отчетов по результатам обработки DICOM-файлов.
//
//	@Summary		Получить отчеты по результатам обработки DICOM-файлов.
//	@Description	Получить отчеты по результатам обработки DICOM-файлов с пагинацией.
//	@Tags			report
//	@Accept			json
//	@Produce		json
//	@Param			offset	query		int				true	"Offset для пагинации (по умолчанию 0)"
//	@Param			limit	query		int				true	"Limit для пагинации (по умолчанию 10)"
//	@Success		200		{object}	GetPaginatedOut	"Отчеты по результатам обработки DICOM-файлов успешно получены."
//	@Failure		400		string		"Некорректный запрос."
//	@Failure		500		string		"Внутренняя ошибка сервера."
//	@Router			/report [get]
func (h *Handler) GetPaginated(c fiber.Ctx) error {
	offset := fiber.Query[uint64](c, "offset", 0)
	limit := fiber.Query[uint64](c, "limit", 10)

	tokenClaims := c.Locals("token_claim")
	if tokenClaims == nil {
		h.metrics.Counter("handler.report.get_paginated.token_claim_nil").Inc()
		h.log.Warn().Msg("token_claim is nil")
		return fiber.NewError(fiber.StatusForbidden, "access denied")
	}

	claims, ok := tokenClaims.(jwt.TokenClaims)
	if !ok {
		h.metrics.Counter("handler.report.get_paginated.token_claim_invalid").Inc()
		h.log.Warn().Msg("token_claim is invalid")
		return fiber.NewError(fiber.StatusForbidden, "access denied")
	}

	reports, err := h.uc.GetPaginated(
		c.Context(), get_paginated.GetPaginatedRequest{
			RequesterID: claims.UserID,
			Offset:      offset,
			Limit:       limit,
		},
	)
	if err != nil {
		h.log.Error().Err(err).Msg("failed to get paginated reports")
		return fiber.NewError(fiber.StatusInternalServerError, "failed to get reports")
	}

	out := convertToOut(reports)
	return c.Status(fiber.StatusOK).JSON(out)
}

func convertToOut(reports []get_paginated.ReportData) GetPaginatedOut {
	var out GetPaginatedOut
	for _, report := range reports {
		out.Reports = append(
			out.Reports, model.Report{
				ID:          report.ID,
				DownloadURL: report.PresignedURL,
				CreatedAt:   report.CreatedAt,
			},
		)
	}
	return out
}
