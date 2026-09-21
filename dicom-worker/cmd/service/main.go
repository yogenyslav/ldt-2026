package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"time"

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

	port, ok := os.LookupEnv("DICOM_WORKER_PORT")
	if !ok {
		port = "8080"
	}

	http.HandleFunc(
		"GET /health", func(w http.ResponseWriter, r *http.Request) {
			_, span := obs.Tracing().Tracer().Start(r.Context(), "health-check")
			defer span.End()

			obs.Metrics().Counter("health_check_requests_total").Inc()

			time.Sleep(1 * time.Second)
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte("OK"))

			obs.Logger().Info().Msg("Health check request processed")
		},
	)

	http.ListenAndServe(":"+port, nil)

	// if err = srv.Serve(); err != nil {
	// 	return err
	// }

	return nil
}
