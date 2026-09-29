package wrappers

import (
	"context"
	"reflect"
	"testing"

	pb "github.com/yogenyslav/ldt-2026/dicom-manager/internal/generated/dicom-worker"
	"google.golang.org/grpc"
	"google.golang.org/protobuf/proto"
)

type settingsClient struct {
	pb.DicomWorkerServiceClient
	request *pb.ProcessDicomFilesIn
}

func (c *settingsClient) ProcessDicomFiles(_ context.Context, request *pb.ProcessDicomFilesIn, _ ...grpc.CallOption) (*pb.ProcessDicomFilesOut, error) {
	payload, err := proto.Marshal(request)
	if err != nil {
		return nil, err
	}

	c.request = &pb.ProcessDicomFilesIn{}
	if err := proto.Unmarshal(payload, c.request); err != nil {
		return nil, err
	}

	return &pb.ProcessDicomFilesOut{JobIds: map[string]string{"dicom": "00000000-0000-4000-8000-000000000001"}}, nil
}

func TestWorkerTransmitsSettings(t *testing.T) {
	client := &settingsClient{}
	settings := map[string]float64{"trochanter_center_mm": 3, "trochanter_tol_percent": 50, "trochanter_yellow_percent": 20}
	jobs, err := NewWorker(client).ProcessDicomFiles(context.Background(), []string{"dicom"}, settings)
	if err != nil || len(jobs) != 1 {
		t.Fatalf("jobs: %v %v", jobs, err)
	}

	if !reflect.DeepEqual(client.request.Settings, settings) {
		t.Fatalf("settings lost: %v", client.request)
	}
}
