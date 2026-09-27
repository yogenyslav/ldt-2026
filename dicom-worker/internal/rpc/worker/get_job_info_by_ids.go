package worker

import (
	"context"

	"github.com/google/uuid"
	dicom_worker "github.com/yogenyslav/ldt-2026/dicom-worker/internal/generated/dicom-worker"
	"github.com/yogenyslav/ldt-2026/dicom-worker/pkg/events"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	"google.golang.org/protobuf/types/known/timestamppb"
)

var (
	statuses = map[string]dicom_worker.JobStatus{
		events.StatusPending:   dicom_worker.JobStatus_JOB_STATUS_PENDING,
		events.StatusRunning:   dicom_worker.JobStatus_JOB_STATUS_RUNNING,
		events.StatusCompleted: dicom_worker.JobStatus_JOB_STATUS_COMPLETED,
		events.StatusFailed:    dicom_worker.JobStatus_JOB_STATUS_FAILED,
	}
)

// GetJobInfoByIDs возвращает информацию о задачах обработки DICOM-файлов.
func (h *Handler) GetJobInfoByIDs(
	ctx context.Context, in *dicom_worker.GetJobInfoByIDsIn,
) (*dicom_worker.GetJobInfoByIDsOut, error) {
	h.metrics.Counter("handler.worker.get_job_info_by_ids.total").Inc()

	if len(in.GetJobIds()) == 0 || len(in.GetJobIds()) > 1000 {
		h.metrics.Counter("handler.worker.get_job_info_by_ids.invalid").Inc()
		h.metrics.Counter("handler.worker.get_job_info_by_ids.error").Inc()
		h.log.Warn().Msg("invalid get_job_info_by_ids request")
		return nil, status.Error(codes.InvalidArgument, "batch must contain 1..1000 job IDs")
	}

	for _, jobID := range in.JobIds {
		if value, err := uuid.Parse(jobID); err != nil || value == uuid.Nil {
			h.metrics.Counter("handler.worker.get_job_info_by_ids.invalid").Inc()
			h.metrics.Counter("handler.worker.get_job_info_by_ids.error").Inc()
			h.log.Warn().Msg("invalid get_job_info_by_ids request")
			return nil, status.Error(codes.InvalidArgument, "invalid job UUID")
		}
	}

	jobs, err := h.getJobsUC.GetByIDs(ctx, in.JobIds)
	if err != nil {
		h.metrics.Counter("handler.worker.get_job_info_by_ids.error").Inc()
		return nil, h.internalError(ctx, err)
	}

	out := &dicom_worker.GetJobInfoByIDsOut{}
	for _, job := range jobs {
		out.Job = append(
			out.Job, &dicom_worker.JobInfo{
				JobId:     job.ID,
				Status:    statuses[job.Status],
				CreatedAt: timestamppb.New(job.CreatedAt),
				UpdatedAt: timestamppb.New(job.UpdatedAt),
			},
		)
	}

	h.metrics.Counter("handler.worker.get_job_info_by_ids.ok").Inc()
	return out, nil
}
