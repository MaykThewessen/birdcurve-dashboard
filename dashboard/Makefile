.PHONY: dev backend frontend install-backend install-frontend test-backend

PYTHON := ~/.pixi/envs/main/bin/python

dev: ## Start both backend and frontend
	@echo "Starting BirdCurve Dashboard..."
	$(MAKE) -j2 backend frontend

backend: ## Start FastAPI backend on :8000
	cd backend && $(PYTHON) -m granian --interface asgi --host 0.0.0.0 --port 8000 --reload app.main:app

frontend: ## Start Vite frontend on :5173
	cd frontend && npm run dev

install-backend: ## Install Python dependencies
	$(PYTHON) -m pip install -r backend/requirements.txt

install-frontend: ## Install Node dependencies
	cd frontend && npm install

test-backend: ## Run backend tests
	cd backend && $(PYTHON) -m pytest tests/ -v
