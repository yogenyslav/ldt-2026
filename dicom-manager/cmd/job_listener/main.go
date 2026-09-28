package main

import (
	"context"
	"fmt"
	"log"
	"os/signal"
	"syscall"
	"time"

	job_storage "github.com/yogenyslav/ldt-2026/dicom-manager/internal/storage/job"
	job_event "github.com/yogenyslav/ldt-2026/dicom-manager/internal/subscribers/job/apply_event"
	uc_apply_event "github.com/yogenyslav/ldt-2026/dicom-manager/internal/usecases/job/apply_event"
	"github.com/yogenyslav/ldt-2026/dicom-manager/pkg/database"
	"github.com/yogenyslav/ldt-2026/dicom-manager/pkg/events"
	"github.com/yogenyslav/ldt-2026/dicom-manager/pkg/messaging"
	"github.com/yogenyslav/ldt-2026/dicom-manager/pkg/observability"
	"golang.org/x/sync/errgroup"
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

	cfg, err := messaging.ReadConfig("dicom-manager", "DICOM_MANAGER_PASSWORD")
	if err != nil {
		return err
	}

	client, err := messaging.New(logger, metrics, cfg)
	if err != nil {
		return fmt.Errorf("init NATS client: %w", err)
	}
	defer client.Close()

	jobStorage := job_storage.New(db)
	applyEvent := uc_apply_event.New(logger, metrics, uow, jobStorage)
	group, ctx := errgroup.WithContext(ctx)
	for subject, durable := range map[string]string{
		events.DocumentUpdated: "manager-updated",
		events.DocumentFailed:  "manager-failed",
	} {
		handler := job_event.New(logger, metrics, applyEvent, subject)
		group.Go(
			func() error {
				return client.Consume(ctx, subject, durable, handler.Handle)
			},
		)
	}
	return group.Wait()
}
