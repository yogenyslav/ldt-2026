package main

import (
	"context"
	"fmt"
	"log"

	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/pressly/goose/v3"
	api_dicom_get_image "github.com/yogenyslav/ldt-2026/dicom-manager/internal/api/dicom/get_image"
	api_dicom_upload "github.com/yogenyslav/ldt-2026/dicom-manager/internal/api/dicom/upload"
	api_dicom_upload_batch "github.com/yogenyslav/ldt-2026/dicom-manager/internal/api/dicom/upload_batch"
	api_job_get_by_id "github.com/yogenyslav/ldt-2026/dicom-manager/internal/api/job/get_by_id"
	api_job_get_paginated "github.com/yogenyslav/ldt-2026/dicom-manager/internal/api/job/get_paginated"
	api_job_result_decision "github.com/yogenyslav/ldt-2026/dicom-manager/internal/api/job/result_decision"
	api_organization_get_by_id "github.com/yogenyslav/ldt-2026/dicom-manager/internal/api/organization/get_by_id"
	api_organization_get_users_paginated "github.com/yogenyslav/ldt-2026/dicom-manager/internal/api/organization/get_users_paginated"
	api_report_generate "github.com/yogenyslav/ldt-2026/dicom-manager/internal/api/report/generate"
	api_report_get_by_id "github.com/yogenyslav/ldt-2026/dicom-manager/internal/api/report/get_by_id"
	api_report_get_paginated "github.com/yogenyslav/ldt-2026/dicom-manager/internal/api/report/get_paginated"
	api_user_get_by_id "github.com/yogenyslav/ldt-2026/dicom-manager/internal/api/user/get_by_id"
	api_user_login "github.com/yogenyslav/ldt-2026/dicom-manager/internal/api/user/login"
	storage_dicom "github.com/yogenyslav/ldt-2026/dicom-manager/internal/storage/dicom"
	storage_job "github.com/yogenyslav/ldt-2026/dicom-manager/internal/storage/job"
	storage_organization "github.com/yogenyslav/ldt-2026/dicom-manager/internal/storage/organization"
	storage_report "github.com/yogenyslav/ldt-2026/dicom-manager/internal/storage/report"
	storage_user "github.com/yogenyslav/ldt-2026/dicom-manager/internal/storage/user"
	uc_dicom_get_image "github.com/yogenyslav/ldt-2026/dicom-manager/internal/usecases/dicom/get_image"
	uc_dicom_upload "github.com/yogenyslav/ldt-2026/dicom-manager/internal/usecases/dicom/upload"
	uc_job_decision "github.com/yogenyslav/ldt-2026/dicom-manager/internal/usecases/job/decision"
	uc_job_get_by_id "github.com/yogenyslav/ldt-2026/dicom-manager/internal/usecases/job/get_by_id"
	uc_job_get_paginated "github.com/yogenyslav/ldt-2026/dicom-manager/internal/usecases/job/get_paginated"
	uc_organization_get_by_id "github.com/yogenyslav/ldt-2026/dicom-manager/internal/usecases/organization/get_by_id"
	uc_organization_get_users "github.com/yogenyslav/ldt-2026/dicom-manager/internal/usecases/organization/get_users"
	uc_report_generate "github.com/yogenyslav/ldt-2026/dicom-manager/internal/usecases/report/generate"
	uc_report_get_by_id "github.com/yogenyslav/ldt-2026/dicom-manager/internal/usecases/report/get_by_id"
	uc_report_get_paginated "github.com/yogenyslav/ldt-2026/dicom-manager/internal/usecases/report/get_paginated"
	uc_user_auth "github.com/yogenyslav/ldt-2026/dicom-manager/internal/usecases/user/auth"
	uc_user_get_by_id "github.com/yogenyslav/ldt-2026/dicom-manager/internal/usecases/user/get_by_id"
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
		_ = obs.Shutdown(context.Background()) //nolint:errcheck // Ошибка освобождения ресурсов не влияет на завершение процесса.
	}()

	logger := obs.Logger()
	metrics := obs.Metrics()
	if err := obs.StartMetricsServer(); err != nil {
		return err
	}

	// Подключение к базе данных.
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
		_ = dbConn.Close() //nolint:errcheck // Ошибка освобождения ресурсов не влияет на завершение процесса.
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

	// Подключение к хранилищу отчетов.
	s3Client, err := filestorage.New()
	if err != nil {
		return fmt.Errorf("init s3 client: %w", err)
	}

	// Настройка HTTP-сервера.
	jwtProvider, err := jwt.New()
	if err != nil {
		return fmt.Errorf("init jwt provider: %w", err)
	}

	srv, err := server.New(obs, jwtProvider)
	if err != nil {
		return fmt.Errorf("init server: %w", err)
	}

	// Подключение к Orthanc.
	orthancClient, err := orthanc.New()
	if err != nil {
		return fmt.Errorf("init orthanc client: %w", err)
	}

	// Подключение к сервису обработки DICOM-файлов.
	dicomWorkerClient, err := dicom_worker.New(obs)
	if err != nil {
		return fmt.Errorf("init dicom worker client: %w", err)
	}
	defer func() {
		_ = dicomWorkerClient.Close() //nolint:errcheck // Ошибка освобождения ресурсов не влияет на завершение процесса.
	}()

	// Репозитории.
	userStorage := storage_user.New(db)
	organizationStorage := storage_organization.New(db)
	jobStorage := storage_job.New(db)
	dicomStorage := storage_dicom.New(db)
	reportStorage := storage_report.New(db)

	// Бизнес-логика и маршруты пользователей.
	userByID := uc_user_get_by_id.New(logger, metrics, userStorage)
	userAuth := uc_user_auth.New(logger, metrics, userStorage, jwtProvider)
	userRouter := srv.Router("user")
	userRouter.Post("/login", api_user_login.New(logger, metrics, userAuth).Login)

	srv.UseMiddleware(server.AuthMiddleware(userAuth.ParseToken))
	userRouter.Get("/:user_id", api_user_get_by_id.New(logger, metrics, userByID).GetByID)

	// Бизнес-логика и маршруты организаций.
	organizationByID := uc_organization_get_by_id.New(logger, metrics, organizationStorage)
	organizationUsers := uc_organization_get_users.New(logger, metrics, organizationStorage)
	organizationRouter := srv.Router("organization")
	organizationRouter.Get(
		"/:org_id", api_organization_get_by_id.New(logger, metrics, organizationByID).GetByID,
	)
	organizationRouter.Get(
		"/:org_id/users", api_organization_get_users_paginated.New(logger, metrics, organizationUsers).GetUsersPaginated,
	)

	// Бизнес-логика и маршруты DICOM-файлов.
	getDicomImage := uc_dicom_get_image.New(logger, metrics, orthancClient.Client(), dicomStorage)
	uploadDicom := uc_dicom_upload.New(
		logger, metrics, uow, dicomStorage, jobStorage, orthancClient, dicomWorkerClient.Client(),
	)
	dicomRouter := srv.Router("dicom")
	dicomRouter.Get("/:dicom_id/image", api_dicom_get_image.New(logger, metrics, getDicomImage).GetImage)
	dicomRouter.Post("/upload", api_dicom_upload.New(logger, metrics, uploadDicom).Upload)
	dicomRouter.Post("/upload/batch", api_dicom_upload_batch.New(logger, metrics, uploadDicom).UploadBatch)

	// Бизнес-логика и маршруты задач обработки.
	getJobByID := uc_job_get_by_id.New(logger, metrics, jobStorage, dicomStorage)
	getJobsPaginated := uc_job_get_paginated.New(logger, metrics, jobStorage)
	jobResultDecision := uc_job_decision.New(logger, metrics, jobStorage)
	jobRouter := srv.Router("job")
	jobRouter.Get("/info/:job_id", api_job_get_by_id.New(logger, metrics, getJobByID).GetByID)
	jobRouter.Get(
		"/info", api_job_get_paginated.New(logger, metrics, getJobsPaginated).GetPaginated,
	)
	jobRouter.Post(
		"/result/decision", api_job_result_decision.New(logger, metrics, jobResultDecision).ResultDecision,
	)

	// Бизнес-логика и маршруты отчетов.
	generateReport := uc_report_generate.New(logger, metrics, uow, reportStorage, s3Client)
	getReportByID := uc_report_get_by_id.New(logger, metrics, reportStorage, s3Client)
	getReportsPaginated := uc_report_get_paginated.New(logger, metrics, reportStorage, s3Client)
	reportRouter := srv.Router("report")
	reportRouter.Post("/generate", api_report_generate.New(logger, metrics, generateReport).Generate)
	reportRouter.Get("/:report_id", api_report_get_by_id.New(logger, metrics, getReportByID).GetByID)
	reportRouter.Get(
		"/", api_report_get_paginated.New(logger, metrics, getReportsPaginated).GetPaginated,
	)

	if err = srv.Serve(); err != nil {
		return fmt.Errorf("serve: %w", err)
	}

	return nil
}
