.PHONY: dev backend frontend install install-backend install-frontend test-backend

# Python comes from the pixi-managed global 'main' env (absolute path so
# recipes work regardless of whether ~/.pixi/bin is on the shell PATH).
# npm resolves from PATH (Homebrew or pixi, whichever is installed) with
# the legacy pixi location as fallback.
PYTHON := $(HOME)/.pixi/envs/main/bin/python
NPM    := $(shell command -v npm || echo $(HOME)/.pixi/bin/npm)

dev: ## Start both backend and frontend
	@echo "Starting BirdCurve Dashboard..."
	$(MAKE) -j2 backend frontend

backend: ## Start FastAPI backend on :8000
	cd backend && $(PYTHON) -m granian --interface asgi --host 0.0.0.0 --port 8000 --reload app.main:app

frontend: ## Start Vite frontend on :5173
	cd frontend && $(NPM) run dev

install: install-backend install-frontend ## Install both backend and frontend deps

install-backend: ## Sync backend Python deps into pixi global 'main' env
	pixi global sync

install-frontend: ## Install frontend Node deps via pixi-provided npm
	cd frontend && $(NPM) install

test-backend: ## Run backend tests
	cd backend && $(PYTHON) -m pytest tests/ -v
