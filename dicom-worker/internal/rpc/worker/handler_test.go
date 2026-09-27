package worker

import (
	"context"
	"testing"

	"github.com/rs/zerolog"
	pb "github.com/yogenyslav/ldt-2026/dicom-worker/internal/generated/dicom-worker"
	metrics_pkg "github.com/yogenyslav/ldt-2026/dicom-worker/pkg/observability/metrics"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

func TestInvalidRequestsDoNotReachUsecases(t *testing.T) {
	logger := zerolog.Nop()
	metricClient, metricsErr := metrics_pkg.New("test")
	if metricsErr != nil {
		t.Fatal(metricsErr)
	}

	h := New(&logger, metricClient, nil, nil)
	for _, in := range []*pb.ProcessDicomFilesIn{nil, {}, {Dicoms: []*pb.DicomData{nil}}, {Dicoms: []*pb.DicomData{{Id: " "}}}, {Dicoms: make([]*pb.DicomData, 1001)}} {
		if _, err := h.ProcessDicomFiles(context.Background(), in); status.Code(err) != codes.InvalidArgument {
			t.Fatalf("invalid request accepted: %v", err)
		}
	}
	for _, in := range []*pb.GetJobInfoByIDsIn{nil, {}, {JobIds: []string{"not-uuid"}}} {
		if _, err := h.GetJobInfoByIDs(context.Background(), in); status.Code(err) != codes.InvalidArgument {
			t.Fatalf("invalid request accepted: %v", err)
		}
	}
}
