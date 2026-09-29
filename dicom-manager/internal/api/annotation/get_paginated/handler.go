package get_paginated

import (
	"context"
	"strconv"

	"github.com/gofiber/fiber/v3"
	"github.com/rs/zerolog"
	"github.com/yogenyslav/ldt-2026/dicom-manager/internal/api/annotation/common"
	"github.com/yogenyslav/ldt-2026/dicom-manager/internal/api/annotation/model"
	storage "github.com/yogenyslav/ldt-2026/dicom-manager/internal/storage/annotation"
	"github.com/yogenyslav/ldt-2026/dicom-manager/pkg/jwt"
	"github.com/yogenyslav/ldt-2026/dicom-manager/pkg/observability"
)

type usecase interface {
	List(ctx context.Context, claims jwt.TokenClaims, filter storage.Filter) (model.ListResponse, error)
}

// Handler возвращает список отправок разметки.
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

// GetPaginated возвращает разметку и её историю с пагинацией.
//
//	@Summary	Получить сохранённую разметку
//	@Tags		annotation
//	@Produce	json
//	@Param		limit			query		int		false	"Размер страницы"	default(50)	minimum(1)	maximum(200)
//	@Param		offset			query		int		false	"Смещение"			default(0)	minimum(0)
//	@Param		job_id			query		string	false	"Идентификатор задачи анализа"
//	@Param		status			query		string	false	"Статус разметки"				Enums(done,uncertain,skipped)
//	@Param		only_latest		query		bool	false	"Только актуальные отправки"	default(true)
//	@Success	200				{object}	model.ListResponse
//	@Failure	400,401,403,500	{object}	model.ErrorResponse
//	@Router		/annotation/submissions [get]
func (h *Handler) GetPaginated(c fiber.Ctx) error {
	claims, err := common.Claims(c, h.metrics)
	if err != nil {
		return common.Fail(h.log, h.metrics, err)
	}

	limit, err := strconv.ParseUint(c.Query("limit", "50"), 10, 64)
	if err != nil || limit < 1 || limit > 200 {
		return common.Fail(h.log, h.metrics, fiber.NewError(fiber.StatusBadRequest, "limit должен быть от 1 до 200"))
	}

	offset, err := strconv.ParseUint(c.Query("offset", "0"), 10, 63)
	if err != nil {
		return common.Fail(h.log, h.metrics, fiber.NewError(fiber.StatusBadRequest, "offset должен быть неотрицательным целым числом"))
	}

	latest := c.Query("only_latest", "true")
	if latest != "true" && latest != "false" {
		return common.Fail(h.log, h.metrics, fiber.NewError(fiber.StatusBadRequest, "only_latest должен быть true или false"))
	}

	out, err := h.uc.List(c.Context(), claims, storage.Filter{
		Limit: limit, Offset: offset, OnlyLatest: latest == "true",
		JobID: c.Query("job_id"), Status: c.Query("status"),
	})
	if err != nil {
		return common.Fail(h.log, h.metrics, err)
	}

	return c.JSON(out)
}
