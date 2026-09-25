package main

import (
	"context"
	"log"

	"github.com/pressly/goose/v3"
	"github.com/yogenyslav/errs"
	"github.com/yogenyslav/ldt-2026/dicom-manager/migrations"
	"github.com/yogenyslav/ldt-2026/dicom-manager/pkg/database"
	"github.com/yogenyslav/ldt-2026/dicom-manager/pkg/observability"
	"github.com/yogenyslav/ldt-2026/dicom-manager/pkg/server"
)

func main() {
	if err := run(); err != nil {
		log.Fatal(err)
	}
}

func run() error {
	errs.WithTrimSourcePref(true)

	obs, err := observability.New()
	if err != nil {
		return errs.Wrap(err, "init observability")
	}
	defer func() {
		_ = obs.Shutdown(context.Background()) //nolint:errcheck // nothing we can do
	}()

	ctx := context.Background()
	db, err := database.NewPostgres(ctx)
	if err != nil {
		return errs.Wrap(err, "connect to database")
	}
	defer db.Close()

	dbConn, err := db.SQLDB()
	if err != nil {
		return errs.Wrap(err, "get sql db")
	}
	defer func() {
		_ = dbConn.Close() //nolint:errcheck // nothing we can do
	}()

	goose.SetBaseFS(migrations.GetMigrationsFS())
	if err = goose.SetDialect("postgres"); err != nil {
		return errs.Wrap(err, "set goose dialect")
	}
	err = goose.Up(dbConn, ".")
	if err != nil {
		return errs.Wrap(err, "apply migrations")
	}

	srv, err := server.New(obs)
	if err != nil {
		return errs.Wrap(err, "init server")
	}

	if err = srv.Serve(); err != nil {
		return errs.Wrap(err, "serve server")
	}

	return nil

}
