package dicomer

import (
	"context"

	dto "github.com/yogenyslav/ldt-2026/dicom-worker/internal/generated/dicom-worker"
)

type Worker struct {
	dto.UnimplementedDicomWorkerServiceServer
}

func (w *Worker) ProcessDicom(ctx context.Context, in *dto.ProcessDicomIn) (*dto.ProcessDicomOut, error) {
	return &dto.ProcessDicomOut{
		JobId: 1,
	}, nil
}

func (w *Worker) GetJobStatus(ctx context.Context, in *dto.GetJobStatusIn) (*dto.GetJobStatusOut, error) {
	return &dto.GetJobStatusOut{
		Status: dto.JobStatus_JOB_STATUS_RUNNING,
	}, nil
}

func (w *Worker) GetJobInfo(ctx context.Context, in *dto.GetJobInfoIn) (*dto.GetJobInfoOut, error) {
	return &dto.GetJobInfoOut{
		Job: &dto.JobInfo{
			JobId:        1,
			CreatorId:    1,
			DicomUid:     "123",
			DicomStudyId: "123",
			Status:       dto.JobStatus_JOB_STATUS_RUNNING,
		},
	}, nil
}

func (w *Worker) GetJobInfoByIDs(ctx context.Context, in *dto.GetJobInfoByIDsIn) (*dto.GetJobInfoByIDsOut, error) {
	return &dto.GetJobInfoByIDsOut{
		Job: []*dto.JobInfo{
			{
				JobId:        1,
				CreatorId:    1,
				DicomUid:     "123",
				DicomStudyId: "123",
				Status:       dto.JobStatus_JOB_STATUS_RUNNING,
			},
			{
				JobId:        2,
				CreatorId:    1,
				DicomUid:     "456",
				DicomStudyId: "456",
				Status:       dto.JobStatus_JOB_STATUS_COMPLETED,
			},
		},
	}, nil
}

func (w *Worker) GetJobsByCreator(ctx context.Context, in *dto.GetJobsByCreatorIn) (*dto.GetJobsByCreatorOut, error) {
	return &dto.GetJobsByCreatorOut{
		Jobs: []*dto.JobInfo{
			{
				JobId:        1,
				CreatorId:    1,
				DicomUid:     "123",
				DicomStudyId: "123",
				Status:       dto.JobStatus_JOB_STATUS_RUNNING,
			},
			{
				JobId:        2,
				CreatorId:    1,
				DicomUid:     "456",
				DicomStudyId: "456",
				Status:       dto.JobStatus_JOB_STATUS_COMPLETED,
			},
		},
	}, nil
}
