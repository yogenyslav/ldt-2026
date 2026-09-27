package main

import (
	"context"
	"fmt"
	"log"

	"github.com/pressly/goose/v3"
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
		_ = obs.Tracing().Shutdown(context.Background()) //nolint:errcheck // nothing we can do
	}()

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

	if err = srv.Serve(); err != nil {
		return fmt.Errorf("serve: %w", err)
	}

	return nil
}
