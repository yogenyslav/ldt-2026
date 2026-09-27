package main

import (
	"context"
	"fmt"
	"log"

	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/pressly/goose/v3"
	dicom_get_image "github.com/yogenyslav/ldt-2026/dicom-manager/internal/api/dicom/get_image"
	dicom_upload "github.com/yogenyslav/ldt-2026/dicom-manager/internal/api/dicom/upload"
	dicom_upload_batch "github.com/yogenyslav/ldt-2026/dicom-manager/internal/api/dicom/upload_batch"
	job_get_by_id "github.com/yogenyslav/ldt-2026/dicom-manager/internal/api/job/get_by_id"
	job_get_paginated "github.com/yogenyslav/ldt-2026/dicom-manager/internal/api/job/get_paginated"
	job_result_decision "github.com/yogenyslav/ldt-2026/dicom-manager/internal/api/job/result_decision"
	organization_get_by_id "github.com/yogenyslav/ldt-2026/dicom-manager/internal/api/organization/get_by_id"
	organization_get_users "github.com/yogenyslav/ldt-2026/dicom-manager/internal/api/organization/get_users_paginated"
	report_generate "github.com/yogenyslav/ldt-2026/dicom-manager/internal/api/report/generate"
	report_get_by_id "github.com/yogenyslav/ldt-2026/dicom-manager/internal/api/report/get_by_id"
	report_get_paginated "github.com/yogenyslav/ldt-2026/dicom-manager/internal/api/report/get_paginated"
	user_get_by_id "github.com/yogenyslav/ldt-2026/dicom-manager/internal/api/user/get_by_id"
	user_login "github.com/yogenyslav/ldt-2026/dicom-manager/internal/api/user/login"
	dicom_storage "github.com/yogenyslav/ldt-2026/dicom-manager/internal/storage/dicom"
	job_storage "github.com/yogenyslav/ldt-2026/dicom-manager/internal/storage/job"
	organization_storage "github.com/yogenyslav/ldt-2026/dicom-manager/internal/storage/organization"
	report_storage "github.com/yogenyslav/ldt-2026/dicom-manager/internal/storage/report"
	user_storage "github.com/yogenyslav/ldt-2026/dicom-manager/internal/storage/user"
	uc_get_dicom_image "github.com/yogenyslav/ldt-2026/dicom-manager/internal/usecases/dicom/get_image"
	uc_upload_dicom "github.com/yogenyslav/ldt-2026/dicom-manager/internal/usecases/dicom/upload"
	uc_job_result_decision "github.com/yogenyslav/ldt-2026/dicom-manager/internal/usecases/job/decision"
	uc_get_job_by_id "github.com/yogenyslav/ldt-2026/dicom-manager/internal/usecases/job/get_by_id"
	uc_get_jobs_paginated "github.com/yogenyslav/ldt-2026/dicom-manager/internal/usecases/job/get_paginated"
	uc_get_organization_by_id "github.com/yogenyslav/ldt-2026/dicom-manager/internal/usecases/organization/get_by_id"
	uc_get_organization_users "github.com/yogenyslav/ldt-2026/dicom-manager/internal/usecases/organization/get_users"
	uc_generate_report "github.com/yogenyslav/ldt-2026/dicom-manager/internal/usecases/report/generate"
	uc_get_report_by_id "github.com/yogenyslav/ldt-2026/dicom-manager/internal/usecases/report/get_by_id"
	uc_get_reports_paginated "github.com/yogenyslav/ldt-2026/dicom-manager/internal/usecases/report/get_paginated"
	uc_user_auth "github.com/yogenyslav/ldt-2026/dicom-manager/internal/usecases/user/auth"
	uc_get_user_by_id "github.com/yogenyslav/ldt-2026/dicom-manager/internal/usecases/user/get_by_id"
	"github.com/yogenyslav/ldt-2026/dicom-manager/migrations"
	"github.com/yogenyslav/ldt-2026/dicom-manager/pkg/database"
	dicom_worker "github.com/yogenyslav/ldt-2026/dicom-manager/pkg/dicom-worker"
	"github.com/yogenyslav/ldt-2026/dicom-manager/pkg/filestorage"
	"github.com/yogenyslav/ldt-2026/dicom-manager/pkg/jwt"
	"github.com/yogenyslav/ldt-2026/dicom-manager/pkg/observability"
	"github.com/yogenyslav/ldt-2026/dicom-manager/pkg/orthanc"
	"github.com/yogenyslav/ldt-2026/dicom-manager/pkg/server"
)

func main() {
	if err := run(); err != nil {
		log.Fatal(err)
	}
}

func run() error {
	obs, err := observability.New()
	if err != nil {
		return fmt.Errorf("init observability: %w", err)
	}
	defer func() {
		_ = obs.Shutdown(context.Background()) //nolint:errcheck // nothing we can do
	}()

	// database setup
	ctx := context.Background()
	db, err := database.NewPostgres(ctx)
	if err != nil {
		return fmt.Errorf("init postgres: %w", err)
	}
	defer db.Close()

	dbConn, err := db.SQLDB()
	if err != nil {
		return fmt.Errorf("get sql db connection: %w", err)
	}
	defer func() {
		_ = dbConn.Close() //nolint:errcheck // nothing we can do
	}()
	uow := database.NewUnitOfWork(db)

	goose.SetBaseFS(migrations.GetMigrationsFS())
	if err = goose.SetDialect("postgres"); err != nil {
		return fmt.Errorf("set goose dialect: %w", err)
	}
	err = goose.Up(dbConn, ".")
	if err != nil {
		return fmt.Errorf("goose up: %w", err)
	}

	// s3 setup
	s3Client, err := filestorage.New()
	if err != nil {
		return fmt.Errorf("init s3 client: %w", err)
	}

	// server setup
	jwtProvider, err := jwt.New()
	if err != nil {
		return fmt.Errorf("init jwt provider: %w", err)
	}

	srv, err := server.New(obs, jwtProvider)
	if err != nil {
		return fmt.Errorf("init server: %w", err)
	}

	// orthanc client
	orthancClient, err := orthanc.New()
	if err != nil {
		return fmt.Errorf("init orthanc client: %w", err)
	}

	// dicom-worker client
	dicomWorkerClient, err := dicom_worker.New(obs)
	if err != nil {
		return fmt.Errorf("init dicom worker client: %w", err)
	}
	defer func() {
		_ = dicomWorkerClient.Close() //nolint:errcheck // nothing we can do
	}()

	// storages
	userStorage := user_storage.New(db)
	organizationStorage := organization_storage.New(db)
	jobStorage := job_storage.New(db)
	dicomStorage := dicom_storage.New(db)
	reportStorage := report_storage.New(db)

	// user usecases and routes
	userByID := uc_get_user_by_id.New(obs.Logger(), obs.Metrics(), userStorage)
	userAuth := uc_user_auth.New(obs.Logger(), obs.Metrics(), userStorage, jwtProvider)
	userRouter := srv.Router("user")
	userRouter.Get("/:user_id", user_get_by_id.New(obs.Logger(), obs.Metrics(), userByID).GetByID)
	userRouter.Get("/login", user_login.New(obs.Logger(), obs.Metrics(), userAuth).Login)

	// organization usecases and routes
	organizationByID := uc_get_organization_by_id.New(obs.Logger(), obs.Metrics(), organizationStorage)
	organizationUsers := uc_get_organization_users.New(obs.Logger(), obs.Metrics(), organizationStorage)
	organizationRouter := srv.Router("organization")
	organizationRouter.Get(
		"/:org_id", organization_get_by_id.New(obs.Logger(), obs.Metrics(), organizationByID).GetByID,
	)
	organizationRouter.Get(
		"/:org_id/users", organization_get_users.New(obs.Logger(), obs.Metrics(), organizationUsers).GetUsersPaginated,
	)

	// dicom usecases and routes
	getDicomImage := uc_get_dicom_image.New(obs.Logger(), obs.Metrics(), orthancClient.Client(), dicomStorage)
	uploadDicom := uc_upload_dicom.New(
		obs.Logger(), obs.Metrics(), uow, dicomStorage, jobStorage, orthancClient, dicomWorkerClient.Client(),
	)
	dicomRouter := srv.Router("dicom")
	dicomRouter.Get("/:id/image", dicom_get_image.New(obs.Logger(), obs.Metrics(), getDicomImage).GetImage)
	dicomRouter.Post("/upload", dicom_upload.New(obs.Logger(), obs.Metrics(), uploadDicom).Upload)
	dicomRouter.Post("/upload/batch", dicom_upload_batch.New(obs.Logger(), obs.Metrics(), uploadDicom).UploadBatch)

	// job usecases and routes
	getJobByID := uc_get_job_by_id.New(obs.Logger(), obs.Metrics(), jobStorage, dicomStorage)
	getJobsPaginated := uc_get_jobs_paginated.New(obs.Logger(), obs.Metrics(), jobStorage)
	jobResultDecision := uc_job_result_decision.New(obs.Logger(), obs.Metrics(), jobStorage)
	jobRouter := srv.Router("job")
	jobRouter.Get("/info/:job_id", job_get_by_id.New(obs.Logger(), obs.Metrics(), getJobByID).GetByID)
	jobRouter.Get(
		"/info", job_get_paginated.New(obs.Logger(), obs.Metrics(), getJobsPaginated).GetPaginated,
	)
	jobRouter.Post(
		"/result/decision", job_result_decision.New(obs.Logger(), obs.Metrics(), jobResultDecision).ResultDecision,
	)

	// report usecases and routes
	generateReport := uc_generate_report.New(obs.Logger(), obs.Metrics(), uow, reportStorage, s3Client)
	getReportByID := uc_get_report_by_id.New(obs.Logger(), obs.Metrics(), reportStorage, s3Client)
	getReportsPaginated := uc_get_reports_paginated.New(obs.Logger(), obs.Metrics(), reportStorage, s3Client)
	reportRouter := srv.Router("report")
	reportRouter.Post("/generate", report_generate.New(obs.Logger(), obs.Metrics(), generateReport).Generate)
	reportRouter.Get("/:report_id", report_get_by_id.New(obs.Logger(), obs.Metrics(), getReportByID).GetByID)
	reportRouter.Get(
		"/", report_get_paginated.New(obs.Logger(), obs.Metrics(), getReportsPaginated).GetPaginated,
	)

	srv.UseMiddleware(server.AuthMiddleware(userAuth.ParseToken))

	if err = srv.Serve(); err != nil {
		return fmt.Errorf("serve: %w", err)
	}

	return nil

}
