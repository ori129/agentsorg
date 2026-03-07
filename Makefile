.PHONY: help up down build logs reset fresh shell fernet-key

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-15s\033[0m %s\n", $$1, $$2}'

up: ## Start all services
	docker compose up -d

down: ## Stop all services
	docker compose down

fresh: ## Stop all services and wipe the database volume (full reset)
	docker compose down -v

build: ## Rebuild all Docker images
	docker compose build

logs: ## Tail logs from all services
	docker compose logs -f

reset: ## Reset registry (clear GPTs and logs)
	curl -s -X POST http://localhost:8000/api/v1/admin/reset | python3 -m json.tool

shell: ## Open a shell in the backend container
	docker compose exec backend bash

fernet-key: ## Generate a Fernet encryption key for .env
	@python3 -c "import base64, os; print(base64.urlsafe_b64encode(os.urandom(32)).decode())"
