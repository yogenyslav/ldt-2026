package messaging

import (
	"context"
	"errors"
	"os"
	"sync/atomic"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/nats-io/nats.go"
	"github.com/rs/zerolog"
	"github.com/yogenyslav/ldt-2026/dicom-worker/pkg/observability/metrics"
)

func TestIntegrationRedeliveryAndOfflineConsumer(t *testing.T) {
	url := os.Getenv("TEST_NATS_URL")
	if url == "" {
		t.Skip("TEST_NATS_URL is not set")
	}
	t.Setenv("NATS_URL", url)
	t.Setenv("NATS_REPLICAS", "1")
	t.Setenv("TEST_NATS_PASSWORD", "")
	client, err := newTestClient("test", "TEST_NATS_PASSWORD")
	if err != nil {
		t.Fatal(err)
	}
	defer client.Close()
	subject := "dicom.test." + uuid.NewString()
	durable := "test-" + uuid.NewString()
	defer client.JetStream().DeleteConsumer(StreamName, durable)
	// Публикуем событие и его повтор до создания подписчика.
	id := uuid.NewString()
	for i := 0; i < 2; i++ {
		if err = client.Publish(context.Background(), subject, id, []byte(`{}`)); err != nil {
			t.Fatal(err)
		}
	}
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	var attempts atomic.Int32
	processed := make(chan struct{}, 1)
	done := make(chan error, 1)
	go func() {
		done <- client.Consume(ctx, subject, durable, func(context.Context, []byte) error {
			if attempts.Add(1) == 1 {
				return errors.New("database temporarily unavailable")
			}
			processed <- struct{}{}
			return nil
		})
	}()
	select {
	case <-processed:
	case err := <-done:
		t.Fatalf("consumer stopped: %v", err)
	case <-ctx.Done():
		t.Fatal("message was not redelivered")
	}
	// Дожидаемся подтверждения и перезапускаем того же постоянного подписчика.
	deadline := time.Now().Add(3 * time.Second)
	for {
		info, err := client.JetStream().ConsumerInfo(StreamName, durable)
		if err != nil {
			t.Fatal(err)
		}
		if info.NumAckPending == 0 {
			break
		}
		if time.Now().After(deadline) {
			t.Fatal("ack not persisted")
		}
		time.Sleep(10 * time.Millisecond)
	}
	cancel()
	if err = <-done; err != nil {
		t.Fatal(err)
	}
	if attempts.Load() != 2 {
		t.Fatalf("unexpected delivery count: %d", attempts.Load())
	}
	info, err := client.JetStream().ConsumerInfo(StreamName, durable)
	if err != nil || info.NumPending != 0 {
		t.Fatalf("durable state lost: %v %v", info, err)
	}
	if err = client.Publish(context.Background(), subject, uuid.NewString(), []byte(`{}`)); err != nil {
		t.Fatal(err)
	}
	sub, err := client.JetStream().PullSubscribe(subject, durable, nats.Bind(StreamName, durable))
	if err != nil {
		t.Fatal(err)
	}
	defer sub.Unsubscribe()
	messages, err := sub.Fetch(1, nats.MaxWait(time.Second))
	if err != nil || len(messages) != 1 {
		t.Fatalf("offline delivery: %v", err)
	}
	if err = messages[0].AckSync(); err != nil {
		t.Fatal(err)
	}
}

func TestIntegrationPermissions(t *testing.T) {
	url := os.Getenv("TEST_NATS_AUTH_URL")
	if url == "" {
		t.Skip("TEST_NATS_AUTH_URL is not set")
	}
	t.Setenv("NATS_URL", url)
	t.Setenv("NATS_REPLICAS", "3")
	t.Setenv("TEST_NATS_PASSWORD", "test")
	clients := make(map[string]*Client)
	for _, role := range []string{"worker", "manager", "analyzer"} {
		client, err := newTestClient("dicom-"+role, "TEST_NATS_PASSWORD")
		if err != nil {
			t.Fatal(err)
		}
		defer client.Close()
		clients[role] = client
	}
	for _, tc := range []struct{ publisher, consumer, subject, durable string }{
		{"worker", "analyzer", "dicom.analysis.requested", "analyzer-requests"},
		{"analyzer", "worker", "dicom.analysis.completed", "worker-completed"},
		{"analyzer", "worker", "dicom.analysis.failed", "worker-failed"},
		{"worker", "manager", "dicom.document.updated", "manager-updated"},
		{"worker", "manager", "dicom.document.failed", "manager-failed"},
	} {
		t.Run(tc.durable, func(t *testing.T) {
			ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
			defer cancel()
			id := uuid.NewString()
			if err := clients[tc.publisher].Publish(ctx, tc.subject, id, []byte(id)); err != nil {
				t.Fatal(err)
			}
			received := make(chan struct{}, 1)
			done := make(chan error, 1)
			go func() {
				done <- clients[tc.consumer].Consume(ctx, tc.subject, tc.durable, func(_ context.Context, data []byte) error {
					if string(data) == id {
						select {
						case received <- struct{}{}:
						default:
						}
					}
					return nil
				})
			}()
			select {
			case <-received:
			case err := <-done:
				t.Fatalf("consumer stopped: %v", err)
			case <-ctx.Done():
				t.Fatal("delivery timed out")
			}
			// Проверяем права пользователя на подтверждение обработки сообщения.
			for ctx.Err() == nil {
				info, err := clients[tc.consumer].JetStream().ConsumerInfo(StreamName, tc.durable)
				if err != nil {
					t.Fatal(err)
				}
				if info.NumAckPending == 0 {
					break
				}
				time.Sleep(10 * time.Millisecond)
			}
			if ctx.Err() != nil {
				t.Fatal("ACK permission failed")
			}
			cancel()
			if err := <-done; err != nil {
				t.Fatal(err)
			}
		})
	}
}

func newTestClient(user, passwordEnv string) (*Client, error) {
	cfg, err := ReadConfig(user, passwordEnv)
	if err != nil {
		return nil, err
	}
	logger := zerolog.Nop()
	metricClient, err := metrics.New("test")
	if err != nil {
		return nil, err
	}
	return New(&logger, metricClient, cfg)
}
