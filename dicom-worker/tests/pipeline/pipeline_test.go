package pipeline

import (
	"context"
	"database/sql"
	"encoding/json"
	"io/fs"
	"net"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/rs/zerolog"
	pb "github.com/yogenyslav/ldt-2026/dicom-worker/internal/generated/dicom-worker"
	"github.com/yogenyslav/ldt-2026/dicom-worker/internal/rpc/worker"
	"github.com/yogenyslav/ldt-2026/dicom-worker/internal/storage/job"
	outbox_storage "github.com/yogenyslav/ldt-2026/dicom-worker/internal/storage/outbox"
	"github.com/yogenyslav/ldt-2026/dicom-worker/internal/usecases/job/get_by_ids"
	"github.com/yogenyslav/ldt-2026/dicom-worker/internal/usecases/job/process"
	"github.com/yogenyslav/ldt-2026/dicom-worker/internal/usecases/outbox/create"
	"github.com/yogenyslav/ldt-2026/dicom-worker/migrations"
	"github.com/yogenyslav/ldt-2026/dicom-worker/pkg/database"
	"github.com/yogenyslav/ldt-2026/dicom-worker/pkg/events"
	"github.com/yogenyslav/ldt-2026/dicom-worker/pkg/messaging"
	metrics_pkg "github.com/yogenyslav/ldt-2026/dicom-worker/pkg/observability/metrics"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
	"google.golang.org/grpc/test/bufconn"
)

func schema(t *testing.T, dsn string, migrationsFS fs.FS) string {
	t.Helper()
	ctx := context.Background()
	admin, err := pgx.Connect(ctx, dsn)
	if err != nil {
		t.Fatal(err)
	}
	name := "pipeline_" + strings.ReplaceAll(uuid.NewString(), "-", "")
	if _, err = admin.Exec(ctx, "create schema "+name); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(
		func() {
			_, _ = admin.Exec(ctx, "drop schema "+name+" cascade")
			_ = admin.Close(ctx)
		},
	)
	u, err := url.Parse(dsn)
	if err != nil {
		t.Fatal(err)
	}
	q := u.Query()
	q.Set("search_path", name)
	u.RawQuery = q.Encode()
	db, err := sql.Open("pgx", u.String())
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	goose.SetBaseFS(migrationsFS)
	if err = goose.SetDialect("postgres"); err != nil {
		t.Fatal(err)
	}
	if err = goose.Up(db, "."); err != nil {
		t.Fatal(err)
	}
	return u.String()
}

func TestPipeline(t *testing.T) {
	logger := zerolog.Nop()
	metricClient, metricsErr := metrics_pkg.New("test")
	if metricsErr != nil {
		t.Fatal(metricsErr)
	}

	binDir, dsn, natsURL := os.Getenv("TEST_BIN_DIR"), os.Getenv("TEST_DATABASE_URI"), os.Getenv("TEST_NATS_AUTH_URL")
	if binDir == "" || dsn == "" || natsURL == "" {
		t.Skip("TEST_BIN_DIR, TEST_DATABASE_URI and TEST_NATS_AUTH_URL are required")
	}
	workerDSN := schema(t, dsn, migrations.GetMigrationsFS())
	managerDSN := schema(t, dsn, os.DirFS("../../../dicom-manager/migrations"))
	t.Setenv("DATABASE_URI", workerDSN)
	t.Setenv("NATS_URL", natsURL)
	t.Setenv("NATS_REPLICAS", "3")
	t.Setenv("DICOM_WORKER_PASSWORD", "test")
	t.Setenv("DICOM_MANAGER_PASSWORD", "test")
	t.Setenv("DICOM_ANALYZER_PASSWORD", "test")
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	managerDB, err := pgx.Connect(ctx, managerDSN)
	if err != nil {
		t.Fatal(err)
	}
	defer managerDB.Close(context.Background())
	_, err = managerDB.Exec(
		ctx,
		`insert into organization(id,name) values(1,'test'); insert into "user"(id,organization_id,full_name,email,password_hash) values(1,1,'test','pipeline@example.test','test'); insert into dicom_file(id,file_name,study_id,series_id,dicom_study_uid,dicom_series_uid,dicom_image_uid,creator_id,organization_id) values('pipeline-ok','test.dcm','study','series','study','series','image',1,1),('pipeline-fail','test.dcm','study','series','study','series','image2',1,1)`,
	)
	if err != nil {
		t.Fatal(err)
	}
	for _, process := range []struct{ name, dsn string }{
		{"outbox", workerDSN}, {"result_listener", workerDSN}, {"expiration_checker", workerDSN}, {"job_listener", managerDSN},
	} {
		processCtx, stop := context.WithCancel(ctx)
		cmd := exec.CommandContext(processCtx, filepath.Join(binDir, process.name))
		for _, env := range os.Environ() {
			if !strings.HasPrefix(env, "DATABASE_URI=") {
				cmd.Env = append(cmd.Env, env)
			}
		}
		cmd.Env = append(
			cmd.Env, "DATABASE_URI="+process.dsn, "APP_NAME=pipeline_"+process.name, "METRICS_ADDR=127.0.0.1:0",
			"TRACING_HOST=localhost", "TRACING_HTTP_PORT=4318",
		)
		logFile, err := os.CreateTemp(t.TempDir(), process.name+"-*.log")
		if err != nil {
			t.Fatal(err)
		}
		cmd.Stdout, cmd.Stderr = logFile, logFile
		if err = cmd.Start(); err != nil {
			t.Fatal(err)
		}
		t.Cleanup(
			func() {
				stop()
				_ = cmd.Wait()
				_ = logFile.Close()
				if t.Failed() {
					data, _ := os.ReadFile(logFile.Name())
					t.Logf("%s: %s", process.name, data)
				}
			},
		)
	}
	db, err := database.NewPostgres(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	server := grpc.NewServer()
	jobStorage := job.New(db)
	createEvent := create.New(&logger, metricClient, outbox_storage.New(db))
	processJobs := process.New(&logger, metricClient, database.NewUnitOfWork(db), jobStorage, createEvent)
	getJobs := get_by_ids.New(&logger, metricClient, jobStorage)
	pb.RegisterDicomWorkerServiceServer(server, worker.New(&logger, metricClient, processJobs, getJobs))
	listener := bufconn.Listen(1 << 20)
	defer listener.Close()
	defer server.Stop()
	go server.Serve(listener)
	conn, err := grpc.NewClient(
		"passthrough:///worker", grpc.WithTransportCredentials(insecure.NewCredentials()),
		grpc.WithContextDialer(func(context.Context, string) (net.Conn, error) { return listener.Dial() }),
	)
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()
	client := pb.NewDicomWorkerServiceClient(conn)
	cfg, err := messaging.ReadConfig("dicom-analyzer", "DICOM_ANALYZER_PASSWORD")
	if err != nil {
		t.Fatal(err)
	}
	bus, err := messaging.New(&logger, metricClient, cfg)
	if err != nil {
		t.Fatal(err)
	}
	defer bus.Close()
	// Используем те же права и постоянного подписчика, что и Python-анализатор.
	_, err = bus.JetStream().AddConsumer(
		messaging.StreamName, &nats.ConsumerConfig{
			Durable: "analyzer-requests", FilterSubject: events.AnalysisRequested,
			AckPolicy: nats.AckExplicitPolicy, DeliverPolicy: nats.DeliverAllPolicy,
			AckWait: time.Minute, MaxAckPending: 100,
		},
	)
	if err != nil {
		t.Fatal(err)
	}
	sub, err := bus.JetStream().PullSubscribe(
		events.AnalysisRequested, "analyzer-requests", nats.Bind(messaging.StreamName, "analyzer-requests"),
	)
	if err != nil {
		t.Fatal(err)
	}
	defer sub.Unsubscribe()
	response, err := client.ProcessDicomFiles(
		ctx, &pb.ProcessDicomFilesIn{Dicoms: []*pb.DicomData{{Id: "pipeline-ok"}, {Id: "pipeline-fail"}}},
	)
	if err != nil {
		t.Fatal(err)
	}
	for dicomID, jobID := range response.JobIds {
		if _, err = managerDB.Exec(
			ctx, `insert into dicom_job_result(job_id,dicom_file_id) values($1,$2)`, jobID, dicomID,
		); err != nil {
			t.Fatal(err)
		}
	}
	seen := map[string]bool{}
	for len(seen) < 2 {
		messages, err := sub.Fetch(1, nats.MaxWait(5*time.Second))
		if err != nil {
			t.Fatal(err)
		}
		request, err := events.Decode(events.AnalysisRequested, messages[0].Data)
		if err != nil {
			t.Fatal(err)
		}
		if messages[0].Header.Get(nats.MsgIdHdr) != request.EventID {
			t.Fatal("request deduplication header differs from event_id")
		}
		if request.Result != nil || request.Error != "" {
			t.Fatal("request contains result fields")
		}
		if response.JobIds[request.DicomID] != request.JobID {
			_ = messages[0].Ack()
			continue
		}
		result := events.New(request.JobID, request.DicomID, "failed")
		subject := events.AnalysisFailed
		result.Error = "test inference failure"
		if request.DicomID == "pipeline-ok" {
			confidence := 0.93
			result.Status = "completed"
			result.Error = ""
			result.Result = &events.Result{
				AnatomicalRegion: "spine", Confidence: &confidence, Violations: []string{},
				Metadata: json.RawMessage(`{"model":"stub"}`),
			}
			subject = events.AnalysisCompleted
		}
		payload, err := json.Marshal(result)
		if err != nil {
			t.Fatal(err)
		}
		if err = bus.Publish(ctx, subject, result.EventID, payload); err != nil {
			t.Fatal(err)
		}
		if err = messages[0].AckSync(); err != nil {
			t.Fatal(err)
		}
		seen[request.JobID] = true
	}
	for ctx.Err() == nil {
		var completed, failed int
		err = managerDB.QueryRow(
			ctx,
			`select count(*) filter(where job_status='completed' and anatomical_region='spine' and confidence=0.93),count(*) filter(where job_status='failed' and metadata->>'error'='test inference failure') from dicom_job_result`,
		).Scan(&completed, &failed)
		if err != nil {
			t.Fatal(err)
		}
		if completed == 1 && failed == 1 {
			jobs, err := client.GetJobInfoByIDs(
				ctx, &pb.GetJobInfoByIDsIn{
					JobIds: []string{
						response.JobIds["pipeline-ok"], response.JobIds["pipeline-fail"],
					},
				},
			)
			if err != nil || len(jobs.GetJob()) != 2 {
				t.Fatalf("gRPC status query failed: %v %v", jobs, err)
			}
			return
		}
		time.Sleep(50 * time.Millisecond)
	}
	t.Fatal("manager did not receive terminal results")
}
