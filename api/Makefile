.PHONY: help up down dev lint test test-run build migrate db-reset

# Default target
help:
	@echo "MosBot API — available commands:"
	@echo ""
	@echo "  make up         Start dev stack from repo root compose"
	@echo "  make down       Stop and remove containers"
	@echo "  make dev        Start API in local dev mode (requires Postgres running separately)"
	@echo "  make lint       Run ESLint"
	@echo "  make test       Run tests (watch mode)"
	@echo "  make test-run   Run tests once (CI mode)"
	@echo "  make build      Build production Docker image for mosbot-api"
	@echo "  make migrate    Run database migrations"
	@echo "  make db-reset   Reset the database (DESTRUCTIVE — dev only)"
	@echo ""
	@echo "First-time setup:"
	@echo "  1. cp .env.example .env && \$$EDITOR .env"
	@echo "  2. make up"
	@echo "  See ../docs/docs/getting-started/quickstart.md for full instructions."
	@echo ""
	@echo "Full-stack testing (with OpenClaw):"
	@echo "  cd ../docker && make setup && make up"
	@echo "  See ../docker/Makefile and ../docker/docker-setup.sh for details."

up:
	DOCKER_BUILDKIT=0 docker compose -f ../docker-compose.yml up -d

down:
	docker compose -f ../docker-compose.yml down

dev:
	npm run dev

lint:
	npm run lint

test:
	npm test

test-run:
	npm test -- --passWithNoTests

build:
	docker build --target production -t mosbot-api:local .

migrate:
	npm run migrate

db-reset:
	@echo "WARNING: This will destroy all data in the local database."
	@read -p "Are you sure? [y/N] " confirm && [ "$$confirm" = "y" ]
	npm run db:reset
