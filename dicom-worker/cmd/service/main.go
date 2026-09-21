package main

import (
	"context"
	"log"

	"github.com/yogenyslav/ldt-2026/dicom-worker/internal/dicomer"
	dicom_worker "github.com/yogenyslav/ldt-2026/dicom-worker/internal/generated/dicom-worker"
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
		return err
	}

	defer func() {
		_ = obs.Tracing().Shutdown(context.Background()) //nolint:errcheck // nothing we can do
	}()

	db, err := database.NewPostgres(ctx)
	if err != nil {
		return err
	}
	defer db.Close()

	srv, err := server.New(obs)
	if err != nil {
		return err
	}

	dicom_worker.RegisterDicomWorkerServiceServer(srv.GRPCServer(), &dicomer.Worker{})

	if err = srv.Serve(); err != nil {
		return err
	}

	return nil
}
