package worker

import (
	"context"

	"github.com/rs/zerolog"
	dicom_worker "github.com/yogenyslav/ldt-2026/dicom-worker/internal/generated/dicom-worker"
	"github.com/yogenyslav/ldt-2026/dicom-worker/internal/usecases/job/get_by_ids"
	"github.com/yogenyslav/ldt-2026/dicom-worker/pkg/observability"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

type processUsecase interface {
	ProcessDicomFiles(ctx context.Context, dicomIDs []string, settings map[string]float64) (map[string]string, error)
}

type getJobsUsecase interface {
	GetByIDs(ctx context.Context, jobIDs []string) ([]get_by_ids.Job, error)
}

// Handler обработчик gRPC-запросов к сервису обработки DICOM-файлов.
type Handler struct {
	dicom_worker.UnimplementedDicomWorkerServiceServer
	log       *zerolog.Logger
	metrics   observability.MetricsClient
	processUC processUsecase
	getJobsUC getJobsUsecase
}

// New создает новый экземпляр Handler.
func New(
	log *zerolog.Logger, metrics observability.MetricsClient, processUC processUsecase, getJobsUC getJobsUsecase,
) *Handler {
	return &Handler{
		log:       log,
		metrics:   metrics,
		processUC: processUC,
		getJobsUC: getJobsUC,
	}
}

func (h *Handler) internalError(ctx context.Context, err error) error {
	if ctx.Err() != nil {
		return status.FromContextError(ctx.Err()).Err()
	}
	h.log.Error().Err(err).Msg("worker storage operation failed")
	return status.Error(codes.Internal, "storage operation failed")
}
