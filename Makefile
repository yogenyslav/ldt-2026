.PHONY: run-all
run-all: run-nats run-orthanc run-storage
	@echo "starting all services"

.PHONY: run-all
run-all: run-nats run-orthanc run-storage
	@echo "starting all services"

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
	@docker compose -f docker/orthanc-compose.yaml --env-file .env up -d

.PHONY: stop-orthanc
stop-orthanc:
	@echo "stopping dicom server with s3 storage"
	@docker compose -f docker/orthanc-compose.yaml --env-file .env down

.PHONY: run-storage
run-storage:
	@echo "setting up s3 storage for reports"
	@docker compose -f docker/storage-compose.yaml --env-file .env up -d

.PHONY: stop-storage
stop-storage:
	@echo "stopping s3 storage for reports"
	@docker compose -f docker/storage-compose.yaml --env-file .env down
