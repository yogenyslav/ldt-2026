package submit

import (
	"context"

	"github.com/gofiber/fiber/v3"
	"github.com/rs/zerolog"
	"github.com/yogenyslav/ldt-2026/dicom-manager/internal/api/annotation/common"
	"github.com/yogenyslav/ldt-2026/dicom-manager/internal/api/annotation/model"
	"github.com/yogenyslav/ldt-2026/dicom-manager/internal/usecases/annotation"
	"github.com/yogenyslav/ldt-2026/dicom-manager/pkg/jwt"
	"github.com/yogenyslav/ldt-2026/dicom-manager/pkg/observability"
)

type usecase interface {
	Submit(ctx context.Context, claims jwt.TokenClaims, in model.Submission) (model.SubmitResponse, error)
}

// Handler сохраняет отправку разметки снимка.
type Handler struct {
	log     *zerolog.Logger
	metrics observability.MetricsClient
	uc      usecase
}

// New создаёт обработчик.
func New(log *zerolog.Logger, metrics observability.MetricsClient, uc usecase) *Handler {
	return &Handler{
		log:     log,
		metrics: metrics,
		uc:      uc,
	}
}

// Submit сохраняет одну неизменяемую отправку разметки.
//
//	@Summary	Сохранить разметку снимка
//	@Tags		annotation
//	@Accept		json
//	@Produce	json
//	@Param		submission					body		model.Submission	true	"Разметка снимка"
//	@Success	201							{object}	model.SubmitResponse
//	@Failure	400,401,403,404,409,422,500	{object}	model.ErrorResponse
//	@Router		/annotation/submission [post]
func (h *Handler) Submit(c fiber.Ctx) error {
	claims, err := common.Claims(c, h.metrics)
	if err != nil {
		return common.Fail(h.log, h.metrics, err)
	}

	in, err := annotation.DecodeSubmission(c.Body())
	if err != nil {
		return common.Fail(h.log, h.metrics, err)
	}

	out, err := h.uc.Submit(c.Context(), claims, in)
	if err != nil {
		return common.Fail(h.log, h.metrics, err)
	}

	return c.Status(fiber.StatusCreated).JSON(out)
}
