package worker

import (
	"context"
	"strings"

	dicom_worker "github.com/yogenyslav/ldt-2026/dicom-worker/internal/generated/dicom-worker"
	"github.com/yogenyslav/ldt-2026/dicom-worker/pkg/events"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

// ProcessDicomFiles создает задачи обработки переданных DICOM-файлов.
func (h *Handler) ProcessDicomFiles(
	ctx context.Context, in *dicom_worker.ProcessDicomFilesIn,
) (*dicom_worker.ProcessDicomFilesOut, error) {
	h.metrics.Counter("handler.worker.process_dicom_files.total").Inc()

	if len(in.GetDicoms()) == 0 || len(in.GetDicoms()) > 1000 {
		h.metrics.Counter("handler.worker.process_dicom_files.invalid").Inc()
		h.metrics.Counter("handler.worker.process_dicom_files.error").Inc()
		h.log.Warn().Msg("invalid process_dicom_files request")
		return nil, status.Error(codes.InvalidArgument, "batch must contain 1..1000 instances")
	}

	dicomIDs := make([]string, 0, len(in.Dicoms))
	for _, dicom := range in.Dicoms {
		if strings.TrimSpace(dicom.GetId()) == "" || len(dicom.GetId()) > 256 {
			h.metrics.Counter("handler.worker.process_dicom_files.invalid").Inc()
			h.metrics.Counter("handler.worker.process_dicom_files.error").Inc()
			h.log.Warn().Msg("invalid process_dicom_files request")
			return nil, status.Error(codes.InvalidArgument, "invalid Orthanc instance ID")
		}
		dicomIDs = append(dicomIDs, dicom.GetId())
	}

	settings, err := events.ResolveSettings(in.GetSettings())
	if err != nil {
		return nil, status.Error(codes.InvalidArgument, err.Error())
	}

	dicomJobs, err := h.processUC.ProcessDicomFiles(ctx, dicomIDs, settings)
	if err != nil {
		h.metrics.Counter("handler.worker.process_dicom_files.error").Inc()
		return nil, h.internalError(ctx, err)
	}

	h.metrics.Counter("handler.worker.process_dicom_files.ok").Inc()
	return &dicom_worker.ProcessDicomFilesOut{JobIds: dicomJobs}, nil
}
