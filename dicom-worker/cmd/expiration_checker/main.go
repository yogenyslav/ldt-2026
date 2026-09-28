package main

import (
	"context"
	"fmt"
	"log"
	"os/signal"
	"syscall"
	"time"

	job_storage "github.com/yogenyslav/ldt-2026/dicom-worker/internal/storage/job"
	outbox_storage "github.com/yogenyslav/ldt-2026/dicom-worker/internal/storage/outbox"
	"github.com/yogenyslav/ldt-2026/dicom-worker/internal/usecases/job/expire"
	"github.com/yogenyslav/ldt-2026/dicom-worker/internal/usecases/outbox/create"
	"github.com/yogenyslav/ldt-2026/dicom-worker/pkg/database"
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

	db, err := database.NewPostgres(ctx)
	if err != nil {
		return fmt.Errorf("init postgres: %w", err)
	}
	defer db.Close()

	logger := obs.Logger()
	createEvent := create.New(logger, obs.Metrics(), outbox_storage.New(db))
	checker := expire.New(logger, obs.Metrics(), database.NewUnitOfWork(db), job_storage.New(db), createEvent)

	logger.Info().Msg("expiration checker started")
	defer logger.Info().Msg("expiration checker stopped")

	checker.Run(ctx)
	return nil
}
