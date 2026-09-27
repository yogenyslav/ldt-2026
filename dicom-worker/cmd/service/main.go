package main

import (
	"context"
	"fmt"
	"log"

	"github.com/pressly/goose/v3"
	pb "github.com/yogenyslav/ldt-2026/dicom-worker/internal/generated/dicom-worker"
	"github.com/yogenyslav/ldt-2026/dicom-worker/internal/rpc/worker"
	job_storage "github.com/yogenyslav/ldt-2026/dicom-worker/internal/storage/job"
	outbox_storage "github.com/yogenyslav/ldt-2026/dicom-worker/internal/storage/outbox"
	uc_get_by_ids "github.com/yogenyslav/ldt-2026/dicom-worker/internal/usecases/job/get_by_ids"
	uc_process "github.com/yogenyslav/ldt-2026/dicom-worker/internal/usecases/job/process"
	uc_create_event "github.com/yogenyslav/ldt-2026/dicom-worker/internal/usecases/outbox/create"
	"github.com/yogenyslav/ldt-2026/dicom-worker/migrations"
	"github.com/yogenyslav/ldt-2026/dicom-worker/pkg/database"
	"github.com/yogenyslav/ldt-2026/dicom-worker/pkg/observability"
	"github.com/yogenyslav/ldt-2026/dicom-worker/pkg/server"
)

func main() {
	if err := run(); err != nil {
		log.Fatal(err)
	}
}

func run() error {
	ctx := context.Background()

	obs, err := observability.New()
	if err != nil {
		return fmt.Errorf("init observability: %w", err)
	}

	defer func() {
		_ = obs.Shutdown(context.Background()) //nolint:errcheck // nothing we can do
	}()

	logger := obs.Logger()
	metrics := obs.Metrics()
	if err := obs.StartMetricsServer(); err != nil {
		return err
	}

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

	goose.SetBaseFS(migrations.GetMigrationsFS())
	if err = goose.SetDialect("postgres"); err != nil {
		return fmt.Errorf("set goose dialect: %w", err)
	}
	err = goose.Up(dbConn, ".")
	if err != nil {
		return fmt.Errorf("goose up: %w", err)
	}

	srv, err := server.New(obs)
	if err != nil {
		return fmt.Errorf("init server: %w", err)
	}

	uow := database.NewUnitOfWork(db)
	jobStorage := job_storage.New(db)
	outboxStorage := outbox_storage.New(db)

	createEvent := uc_create_event.New(logger, metrics, outboxStorage)
	processDicoms := uc_process.New(logger, metrics, uow, jobStorage, createEvent)
	getJobs := uc_get_by_ids.New(logger, metrics, jobStorage)

	pb.RegisterDicomWorkerServiceServer(srv.GRPCServer(), worker.New(logger, metrics, processDicoms, getJobs))

	if err = srv.Serve(); err != nil {
		return fmt.Errorf("serve: %w", err)
	}

	return nil
}
