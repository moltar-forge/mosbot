.PHONY: help dev lint test test-run build

help:
	@echo "MosBot Dashboard — available commands:"
	@echo ""
	@echo "  make dev        Start Vite dev server (http://localhost:5173)"
	@echo "  make lint       Run ESLint"
	@echo "  make test       Run tests (watch mode)"
	@echo "  make test-run   Run tests once (CI mode)"
	@echo "  make build      Build for production (output: dist/)"
	@echo ""
	@echo "For the full stack (API + Dashboard + Postgres):"
	@echo "  cd ../mosbot-api && make up"

dev:
	npm run dev

lint:
	npm run lint

test:
	npm run test

test-run:
	npm run test:run

build:
	npm run build
