.PHONY: data
data:
	@rm -rf data
	@echo "deleted old data folder"
	@python3 scripts/data.py
	@echo "unzipped data from data.zip"

.PHONY: run-nats
run-nats:
	@echo "running nats server"
	@docker compose -f docker/nats-compose.yaml --env-file .env up -d

.PHONY: stop-nats
stop-nats:
	@echo "stopping nats server"
	@docker compose -f docker/nats-compose.yaml --env-file .env down
