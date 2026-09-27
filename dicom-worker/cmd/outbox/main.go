package main

import (
	"context"
	"fmt"
	"log"
	"os/signal"
	"syscall"
	"time"

	"github.com/yogenyslav/ldt-2026/dicom-worker/internal/outbox"
	job_storage "github.com/yogenyslav/ldt-2026/dicom-worker/internal/storage/job"
	outbox_storage "github.com/yogenyslav/ldt-2026/dicom-worker/internal/storage/outbox"
	uc_create_event "github.com/yogenyslav/ldt-2026/dicom-worker/internal/usecases/outbox/create"
	uc_publish_next "github.com/yogenyslav/ldt-2026/dicom-worker/internal/usecases/outbox/publish_next"
	"github.com/yogenyslav/ldt-2026/dicom-worker/pkg/database"
	"github.com/yogenyslav/ldt-2026/dicom-worker/pkg/messaging"
	"github.com/yogenyslav/ldt-2026/dicom-worker/pkg/observability"
)

func main() {
	if err := run(); err != nil {
		log.Fatal(err)
	}
}

func run() error {
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	obs, err := observability.New()
	if err != nil {
		return fmt.Errorf("init observability: %w", err)
	}
	defer func() {
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if err := obs.Shutdown(shutdownCtx); err != nil {
			obs.Logger().Error().Err(err).Msg("observability shutdown failed")
		}
	}()
	if err := obs.StartMetricsServer(); err != nil {
		return err
	}
	
	logger := obs.Logger()
	metrics := obs.Metrics()

	db, err := database.NewPostgres(ctx)
	if err != nil {
		return fmt.Errorf("init postgres: %w", err)
	}
	defer db.Close()
	uow := database.NewUnitOfWork(db)

	cfg, err := messaging.ReadConfig("dicom-worker", "DICOM_WORKER_PASSWORD")
	if err != nil {
		return err
	}
	client, err := messaging.New(logger, metrics, cfg)
	if err != nil {
		return fmt.Errorf("init NATS client: %w", err)
	}
	defer client.Close()

	jobStorage := job_storage.New(db)
	outboxStorage := outbox_storage.New(db)
	createEvent := uc_create_event.New(logger, metrics, outboxStorage)
	publishNext := uc_publish_next.New(logger, metrics, uow, jobStorage, outboxStorage, createEvent, client)
	dispatcher := outbox.New(logger, metrics, publishNext)
	return dispatcher.Run(ctx)
}
