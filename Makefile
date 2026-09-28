.PHONY: swag
swag:
	@echo "generating swagger docs"
	@cd dicom-manager && swag fmt && swag init -g cmd/service/main.go -o docs

.PHONY: migrate-new
migrate-new:
	@echo "creating new migration in $(service)/migrations"
	@mkdir -p $(service)/migrations
	@cd $(service)/migrations && goose create $(name) sql

.PHONY: generate
generate: proto generate-orthanc
	@echo "running available codegens"

.PHONY: proto
proto:
	@set -eu; \
	find . -name go.mod -not -path '*/vendor/*' -print | while read -r mod; do \
		service_dir=$$(dirname "$$mod"); \
		module=$$(sed -n 's/^module[[:space:]]\+//p' "$$mod" | head -n 1); \
		find "$$service_dir" -type f -name '*.proto' -not -path '*/vendor/*' -print | while read -r proto; do \
			echo "Generating Go code from $$proto"; \
			protoc \
				-I "$$service_dir" \
				--go_out="$$service_dir" \
				--go_opt=module="$$module" \
				--go-grpc_out="$$service_dir" \
				--go-grpc_opt=module="$$module" \
				"$$proto"; \
		done; \
	done

.PHONY: generate-orthanc
generate-orthanc:
	@echo "generating orthanc client"
	@oapi-codegen -config dicom-manager/orthanc-generator.yaml api/orthanc/orthanc.yaml

.PHONY: run-nats
run-nats:
	@echo "running nats server"
	@docker compose -f docker/nats-compose.yaml --env-file .env up -d

.PHONY: stop-nats
stop-nats:
	@echo "stopping nats server"
	@docker compose -f docker/nats-compose.yaml --env-file .env down

.PHONY: run-orthanc
run-orthanc:
	@echo "running dicom server with s3 storage"
	@docker compose -f orthanc/orthanc-compose.yaml --env-file .env up -d

.PHONY: stop-orthanc
stop-orthanc:
	@echo "stopping dicom server with s3 storage"
	@docker compose -f orthanc/orthanc-compose.yaml --env-file .env down

.PHONY: run-storage
run-storage:
	@echo "setting up s3 storage for reports"
	@docker compose -f docker/storage-compose.yaml --env-file .env up -d

.PHONY: stop-storage
stop-storage:
	@echo "stopping s3 storage for reports"
	@docker compose -f docker/storage-compose.yaml --env-file .env down

.PHONY: run-observability
run-observability:
	@echo "running observability stack"
	@docker compose -f docker/observability-compose.yaml --env-file .env up -d

.PHONY: stop-observability
stop-observability:
	@echo "stopping observability stack"
	@docker compose -f docker/observability-compose.yaml --env-file .env down

.PHONY: run-worker
run-worker:
	@echo "running dicom worker"
	@docker compose -f dicom-worker/compose.yaml --env-file .env up -d

.PHONY: run-worker-build
run-worker-build:
	@echo "building and running dicom worker"
	@docker compose -f dicom-worker/compose.yaml --env-file .env up -d --build

.PHONY: stop-worker
stop-worker:
	@echo "stopping dicom worker"
	@docker compose -f dicom-worker/compose.yaml --env-file .env down

.PHONY: run-manager
run-manager:
	@echo "running dicom manager"
	@docker compose -f dicom-manager/compose.yaml --env-file .env up -d

.PHONY: run-manager-build
run-manager-build:
	@echo "building and running dicom manager"
	@docker compose -f dicom-manager/compose.yaml --env-file .env up -d --build

.PHONY: stop-manager
stop-manager:
	@echo "stopping dicom manager"
	@docker compose -f dicom-manager/compose.yaml --env-file .env down

.PHONY: run-ui
run-ui:
	@echo "running ui service"
	@docker compose -f docker/ui-compose.yaml --env-file .env up -d

.PHONY: stop-ui
stop-ui:
	@echo "stopping ui service"
	@docker compose -f docker/ui-compose.yaml --env-file .env down

.PHONY: run-analyzer run-analyzer-build stop-analyzer
run-analyzer:
	@docker compose -f dicom-analyzer/compose.yaml --env-file .env up -d

run-analyzer-build:
	@docker compose -f dicom-analyzer/compose.yaml --env-file .env up -d --build

stop-analyzer:
	@docker compose -f dicom-analyzer/compose.yaml --env-file .env down

.PHONY: test-integration
test-integration:
	@bash scripts/test-integration.sh
