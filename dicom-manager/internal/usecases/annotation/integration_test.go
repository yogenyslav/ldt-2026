package annotation

import (
	"context"
	"encoding/json"
	"errors"
	"sync"
	"testing"

	"github.com/rs/zerolog"
	"github.com/stretchr/testify/require"
	storage "github.com/yogenyslav/ldt-2026/dicom-manager/internal/storage/annotation"
	"github.com/yogenyslav/ldt-2026/dicom-manager/pkg/database"
	"github.com/yogenyslav/ldt-2026/dicom-manager/pkg/jwt"
	"github.com/yogenyslav/ldt-2026/dicom-manager/pkg/observability/metrics"
)

func annotationService(t *testing.T) (*Usecase, jwt.TokenClaims) {
	t.Helper()
	db := integrationDB(t)
	_, err := db.Exec(context.Background(), `
		insert into organization (id, name) values (900001, 'Разметка'), (900002, 'Другая организация');
		insert into "user" (id, organization_id, full_name, email, password_hash, role)
		values (900001, 900001, 'Администратор', 'annotation@test', '', 'admin'),
		(900002, 900002, 'Администратор', 'other@test', '', 'admin');
		insert into dicom_file (id, file_name, study_id, series_id, dicom_study_uid, dicom_series_uid, dicom_image_uid, creator_id, organization_id)
		values ('annotation-test', 'test.dcm', 'study', 'series', 'study', 'series', 'image', 900001, 900001);
		insert into dicom_job_result (job_id, dicom_file_id, metadata)
		values ('00000000-0000-0000-0000-000000000001', 'annotation-test', '{"shape":[263,280]}'),
		('00000000-0000-0000-0000-000000000002', 'annotation-test', '{}');`)
	require.NoError(t, err)
	log := zerolog.Nop()
	m, err := metrics.New("annotation_test")
	require.NoError(t, err)
	return New(&log, m, database.NewUnitOfWork(db), storage.New(db)), jwt.TokenClaims{UserID: 900001, OrganizationID: 900001, Role: "admin"}
}

func TestSubmissionHistoryIntegration(t *testing.T) {
	uc, claims := annotationService(t)
	ctx := context.Background()
	in := fixture(t)
	out, err := uc.Submit(ctx, claims, in)
	require.NoError(t, err)
	require.Equal(t, in.SubmissionID, out.SubmissionID)
	require.NotNil(t, out.Warnings)

	_, err = uc.Submit(ctx, claims, in)
	require.NoError(t, err)
	changed := in
	changed.Comment = "Другие данные с тем же идентификатором"
	_, err = uc.Submit(ctx, claims, changed)
	require.ErrorIs(t, err, ErrIDConflict)

	filter := storage.Filter{Limit: 50, OnlyLatest: true}
	page, err := uc.List(ctx, claims, filter)
	require.NoError(t, err)
	require.EqualValues(t, 1, page.Total)
	require.Len(t, page.Submissions, 1)
	require.Equal(t, "900001", page.Submissions[0].Annotator.ID)
	require.Equal(t, "admin", page.Submissions[0].Annotator.Role)
	require.Nil(t, page.Submissions[0].SupersededBy)

	correction := in
	correction.SubmissionID = "01J8ZQ7K3M4N5P6Q7R8S9T0V1X"
	correction.Supersedes = &in.SubmissionID
	correction.Status, correction.Comment = "uncertain", "Нужен второй взгляд"
	_, err = uc.Submit(ctx, claims, correction)
	require.NoError(t, err)
	_, err = uc.Submit(ctx, claims, correction)
	require.NoError(t, err)
	_, err = uc.Submit(ctx, claims, in)
	require.NoError(t, err)

	stale := correction
	stale.SubmissionID = "01J8ZQ7K3M4N5P6Q7R8S9T0V1Y"
	_, err = uc.Submit(ctx, claims, stale)
	require.ErrorIs(t, err, ErrSuperseded)
	page, err = uc.List(ctx, claims, filter)
	require.NoError(t, err)
	require.EqualValues(t, 1, page.Total)
	require.Equal(t, correction.SubmissionID, page.Submissions[0].SubmissionID)
	filter.Status = "done"
	page, err = uc.List(ctx, claims, filter)
	require.NoError(t, err)
	require.Zero(t, page.Total)
	require.Empty(t, page.Submissions)

	filter.Status, filter.OnlyLatest = "", false
	page, err = uc.List(ctx, claims, filter)
	require.NoError(t, err)
	require.EqualValues(t, 2, page.Total)
	require.Equal(t, correction.SubmissionID, *page.Submissions[1].SupersededBy)
	require.Empty(t, page.Submissions[1].Comment)
	filter.Offset = 100
	page, err = uc.List(ctx, claims, filter)
	require.NoError(t, err)
	require.EqualValues(t, 2, page.Total)
	require.NotNil(t, page.Submissions)
	require.Empty(t, page.Submissions)

	other := jwt.TokenClaims{UserID: 900002, OrganizationID: 900002, Role: "admin"}
	page, err = uc.List(ctx, other, storage.Filter{Limit: 50, OrganizationID: claims.OrganizationID})
	require.NoError(t, err)
	require.Zero(t, page.Total)
	_, err = uc.Submit(ctx, other, in)
	require.ErrorIs(t, err, ErrJobNotFound)
	specialist := claims
	specialist.Role = "specialist"
	_, err = uc.Submit(ctx, specialist, in)
	require.ErrorIs(t, err, ErrForbidden)
	_, err = uc.List(ctx, specialist, filter)
	require.ErrorIs(t, err, ErrForbidden)

	training, err := uc.Training(ctx, claims)
	require.NoError(t, err)
	require.EqualValues(t, 1, training.Targets[0].Have)
	require.False(t, training.Targets[0].Ready)
	require.Empty(t, training.Versions)
	require.ErrorIs(t, uc.StartTraining(ctx, claims, []string{"hip_keypoints"}), ErrTrainingUnavailable)
	require.ErrorIs(t, uc.SwitchTraining(ctx, claims, []string{"hip_keypoints"}), ErrVersionNotFound)

	skipped := correction
	skipped.SubmissionID = stale.SubmissionID
	skipped.Supersedes = &correction.SubmissionID
	skipped.Status = "skipped"
	_, err = uc.Submit(ctx, claims, skipped)
	require.NoError(t, err)
	training, err = uc.Training(ctx, claims)
	require.NoError(t, err)
	require.Zero(t, training.Targets[0].Have)
}

func TestSubmissionCoordinatesIntegration(t *testing.T) {
	uc, claims := annotationService(t)
	ctx := context.Background()
	in := fixture(t)
	in.Image.Rows++
	_, err := uc.Submit(ctx, claims, in)
	require.ErrorIs(t, err, ErrCoordinates)
	in = fixture(t)
	in.JobID = "00000000-0000-0000-0000-000000000002"
	in.TaskID = in.JobID + ":hip_keypoints"
	_, err = uc.Submit(ctx, claims, in)
	require.ErrorIs(t, err, ErrCoordinates)
	in.JobID = "00000000-0000-0000-0000-000000000003"
	in.TaskID = in.JobID + ":hip_keypoints"
	_, err = uc.Submit(ctx, claims, in)
	require.ErrorIs(t, err, ErrJobNotFound)
	page, err := uc.List(ctx, claims, storage.Filter{Limit: 50})
	require.NoError(t, err)
	require.Zero(t, page.Total)
}

func TestConcurrentSubmissionsIntegration(t *testing.T) {
	uc, claims := annotationService(t)
	ctx := context.Background()
	in := fixture(t)
	var wg sync.WaitGroup
	errs := make(chan error, 8)
	for range 8 {
		wg.Go(func() { _, err := uc.Submit(ctx, claims, in); errs <- err })
	}
	wg.Wait()
	close(errs)
	for err := range errs {
		require.NoError(t, err)
	}

	errs = make(chan error, 2)
	for _, id := range []string{"01J8ZQ7K3M4N5P6Q7R8S9T0V1X", "01J8ZQ7K3M4N5P6Q7R8S9T0V1Y"} {
		wg.Go(func() {
			correction := in
			correction.SubmissionID, correction.Supersedes = id, &in.SubmissionID
			_, err := uc.Submit(ctx, claims, correction)
			errs <- err
		})
	}
	wg.Wait()
	close(errs)
	ok, conflict := 0, 0
	for err := range errs {
		if err == nil {
			ok++
		} else if errors.Is(err, ErrSuperseded) {
			conflict++
		} else {
			t.Fatal(err)
		}
	}
	require.Equal(t, 1, ok)
	require.Equal(t, 1, conflict)
	page, err := uc.List(ctx, claims, storage.Filter{Limit: 50})
	require.NoError(t, err)
	require.EqualValues(t, 2, page.Total)
}

func TestTrainingCountsIntegration(t *testing.T) {
	uc, claims := annotationService(t)
	ctx := context.Background()
	in := fixture(t)
	in.TaskID = in.JobID + ":pelvis_crest"
	in.Annotations = map[string]json.RawMessage{"pelvis_crest": json.RawMessage(`{"points":[{"name":"crest_left","present":false,"x":null,"y":null,"origin":"human"},{"name":"crest_right","present":true,"x":1,"y":2,"origin":"model"}]}`)}
	_, err := uc.Submit(ctx, claims, in)
	require.NoError(t, err)
	training, err := uc.Training(ctx, claims)
	require.NoError(t, err)
	require.EqualValues(t, 1, training.Targets[1].Have)
	require.EqualValues(t, 1, training.Targets[2].Have)

	correction := in
	correction.SubmissionID, correction.Supersedes = "01J8ZQ7K3M4N5P6Q7R8S9T0V1X", &in.SubmissionID
	correction.Annotations = map[string]json.RawMessage{"pelvis_crest": json.RawMessage(`{"points":[{"name":"crest_left","present":false,"x":null,"y":null,"origin":"model"},{"name":"crest_right","present":true,"x":1,"y":2,"origin":"model"}]}`)}
	_, err = uc.Submit(ctx, claims, correction)
	require.NoError(t, err)
	training, err = uc.Training(ctx, claims)
	require.NoError(t, err)
	require.Zero(t, training.Targets[1].Have)
	require.Zero(t, training.Targets[2].Have)
}
