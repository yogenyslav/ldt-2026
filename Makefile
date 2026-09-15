.PHONY: data
data:
	@rm -rf data
	@echo "deleted old data folder"
	@python3 scripts/data.py
	@echo "unzipped data from data.zip"
