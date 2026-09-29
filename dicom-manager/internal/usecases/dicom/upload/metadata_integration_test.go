package upload

import (
	"context"
	"testing"

	"github.com/rs/zerolog"
	storage "github.com/yogenyslav/ldt-2026/dicom-manager/internal/storage/dicom"
	"github.com/yogenyslav/ldt-2026/dicom-manager/internal/usecases/dicom/upload/wrappers/dto"
	"github.com/yogenyslav/ldt-2026/dicom-manager/pkg/database"
	"github.com/yogenyslav/ldt-2026/dicom-manager/pkg/observability/metrics"
)

func TestIntegrationDicomMetadata(t *testing.T) {
	db := integrationDB(t)
	ctx := context.Background()
	_, err := db.Exec(ctx, `insert into organization(id,name) values(905,'metadata');
 insert into "user"(id,organization_id,full_name,email,password_hash)
 values(905,905,'metadata','metadata@example.test','test')`)
	if err != nil {
		t.Fatal(err)
	}
	repo := storage.New(db)
	log := zerolog.Nop()
	m, err := metrics.New("metadata_test")
	if err != nil {
		t.Fatal(err)
	}
	props := dto.OrthancDicomProperties{ID: "manager", FileName: "file", ParentSeries: "series", ParentStudy: "study", DicomImageUid: "image-uid", DicomStudyUid: "study-uid", DicomSeriesUid: "series-uid", PatientID: "p1", DeviceModel: "Modality=DX; Manufacturer=Maker; ManufacturerModelName=Model; DeviceSerialNumber=serial; StationName=station"}
	uc := &Usecase{log: &log, metrics: m, uow: database.NewUnitOfWork(db), dicomRepo: repo, dicomer: &orthancStub{props: []dto.OrthancDicomProperties{props}}, worker: workerStub{}, jobCreator: jobsStub{}}
	_, err = uc.UploadDicomFiles(ctx, DicomUploadRequest{CreatorID: 905, OrganizationID: 905, SyncOrthanc: true, RawDicoms: []RawDicomData{{FileName: "patient/study/test.dcm"}}})
	if err != nil {
		t.Fatal(err)
	}
	want := storage.Dicom{UploadSource: storage.UploadSourceManual, ID: "manager", FileName: "patient/study/test.dcm", SeriesID: "series", StudyID: "study", DicomImageUid: "image-uid", DicomStudyUid: "study-uid", DicomSeriesUid: "series-uid", CreatorID: 905, OrganizationID: 905, PatientID: "p1", DeviceModel: "Modality=DX; Manufacturer=Maker; ManufacturerModelName=Model; DeviceSerialNumber=serial; StationName=station"}
	check := func(want storage.Dicom) {
		t.Helper()
		got, err := repo.GetByID(ctx, want.ID)
		if err != nil {
			t.Fatal(err)
		}
		if got.CreatedAt.IsZero() {
			t.Fatal("missing created_at")
		}
		want.CreatedAt = got.CreatedAt
		if got != want {
			t.Fatalf("got=%+v want=%+v", got, want)
		}
	}
	check(want)
	// Повторная регистрация через другой путь не меняет исходный источник.
	if err := uc.RegisterOrthanc(ctx, want); err != nil {
		t.Fatal(err)
	}
	check(want)
	want.ID = "callback"
	want.UploadSource = storage.UploadSourceOrthanc
	if err := uc.RegisterOrthanc(ctx, want); err != nil {
		t.Fatal(err)
	}
	check(want)
	// Старые клиенты и файлы без необязательных тегов остаются допустимыми.
	empty := storage.Dicom{UploadSource: storage.UploadSourceOrthanc, ID: "empty", CreatorID: 905, OrganizationID: 905}
	if err := uc.RegisterOrthanc(ctx, empty); err != nil {
		t.Fatal(err)
	}
	check(empty)
}
