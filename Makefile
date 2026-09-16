.PHONY: data
data:
	@rm -rf data
	@echo "deleted old data folder"
	@python3 scripts/data.py
	@echo "unzipped data from data.zip"

.PHONY: run-all
run-all: run-nats run-orthanc
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
