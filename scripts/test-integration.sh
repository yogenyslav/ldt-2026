#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
task_bin_dir=$(mktemp -d "${TMPDIR:-/tmp}/dicom-integration.XXXXXX")
cleanup() {
  docker compose -f docker/test-compose.yaml down --volumes
  rm -rf "$task_bin_dir"
}
trap cleanup EXIT
docker compose -f docker/test-compose.yaml up -d --wait
for attempt in {1..30}; do
  if curl --silent --fail 'http://localhost:18223/healthz?js-enabled-only=true' >/dev/null; then break; fi
  sleep 1
done
curl --silent --show-error --fail 'http://localhost:18223/healthz?js-enabled-only=true' >/dev/null
export TEST_DATABASE_URI='postgres://test:test@localhost:15432/test?sslmode=disable'
export TEST_NATS_URL='nats://localhost:14222'
export TEST_NATS_AUTH_URL='nats://localhost:14223'
export TEST_BIN_DIR="$task_bin_dir"
(
  cd dicom-manager
  go build -o "$task_bin_dir/job_listener" ./cmd/job_listener
  go test -race -count=1 ./...
  go vet ./...
)
(
  cd dicom-worker
  go build -o "$task_bin_dir/outbox" ./cmd/outbox
  go build -o "$task_bin_dir/result_listener" ./cmd/result_listener
  # Проверки ACL и полного потока используют одних постоянных подписчиков NATS.
  go test -p 1 -race -count=1 ./...
  go vet ./...
)
for package in events messaging; do
  diff -ru --exclude='*_test.go' "dicom-manager/pkg/$package" "dicom-worker/pkg/$package"
done
