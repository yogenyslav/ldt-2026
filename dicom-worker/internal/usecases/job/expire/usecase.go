package expire

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/rs/zerolog"
	storage "github.com/yogenyslav/ldt-2026/dicom-worker/internal/storage/job"
	"github.com/yogenyslav/ldt-2026/dicom-worker/pkg/database"
	"github.com/yogenyslav/ldt-2026/dicom-worker/pkg/events"
	"github.com/yogenyslav/ldt-2026/dicom-worker/pkg/observability"
)

const (
	PendingTimeout = 5 * time.Minute
	RunningTimeout = 3 * time.Minute
)

type jobRepo interface {
	GetExpiredForUpdate(context.Context, time.Duration, time.Duration) (storage.Job, error)
	UpdateJobStatus(ctx context.Context, jobID, status, errorMessage string) error
}

type eventCreator interface {
	CreateEvent(context.Context, string, events.Event) error
}

// Usecase завершает зависшие задачи и уведомляет manager через outbox.
type Usecase struct {
	log     *zerolog.Logger
	metrics observability.MetricsClient
	uow     database.UnitOfWork
	jobs    jobRepo
	events  eventCreator
}

func New(log *zerolog.Logger, metrics observability.MetricsClient, uow database.UnitOfWork, jobs jobRepo, events eventCreator) *Usecase {
	return &Usecase{log: log, metrics: metrics, uow: uow, jobs: jobs, events: events}
}

// ExpireNext атомарно завершает одну просроченную задачу и сохраняет уведомление.
func (uc *Usecase) ExpireNext(ctx context.Context) (bool, error) {
	uc.metrics.Counter("usecases.job.expire.total").Inc()
	startedAt := time.Now()
	defer func() {
		uc.metrics.Gauge("usecases.job.expire.duration_seconds").Set(time.Since(startedAt).Seconds())
	}()

	found := false
	var previousStatus string

	err := uc.uow.WithTx(ctx, database.TxLevelReadCommitted, func(ctx context.Context) error {
		job, err := uc.jobs.GetExpiredForUpdate(ctx, PendingTimeout, RunningTimeout)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return nil
			}
			return err
		}

		found = true
		previousStatus = job.Status
		timeout := PendingTimeout
		if job.Status == events.StatusRunning {
			timeout = RunningTimeout
		}

		event := events.New(job.ID, job.DicomID, events.StatusFailed)
		event.Error = fmt.Sprintf("job timeout: %s exceeded %s", job.Status, timeout)
		if err := uc.jobs.UpdateJobStatus(ctx, job.ID, event.Status, event.Error); err != nil {
			return err
		}

		return uc.events.CreateEvent(ctx, events.DocumentFailed, event)
	})

	if err != nil {
		uc.metrics.Counter("usecases.job.expire.error").Inc()
		return found, err
	}
	if !found {
		uc.metrics.Counter("usecases.job.expire.empty").Inc()
		return false, nil
	}

	// Учитываем завершенные задачи только после успешного commit.
	uc.metrics.Counter("usecases.job.expire.ok").Inc()
	uc.metrics.Counter("usecases.job.expire." + previousStatus).Inc()
	return true, nil
}

// Run проверяет таймауты при старте и каждую секунду, независимо от доступности NATS.
func (uc *Usecase) Run(ctx context.Context) {
	uc.metrics.Gauge("expiration_checker.active").Set(1)
	defer uc.metrics.Gauge("expiration_checker.active").Set(0)

	ticker := time.NewTicker(time.Second)
	defer ticker.Stop()

	for ctx.Err() == nil {
		workCtx, cancel := context.WithTimeout(ctx, 15*time.Second)
		found, err := uc.ExpireNext(workCtx)
		cancel()
		if err != nil {
			uc.log.Error().Err(err).Msg("failed to expire job")
		}
		if found && err == nil {
			continue
		}

		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
		}
	}
}
