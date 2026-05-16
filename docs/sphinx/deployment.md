# Deployment

## Local development

```bash
pixi install
pixi run dev          # starts backend (:8000) + frontend (:5173) concurrently
```

Backend reads `BIRDCURVE_DB_PATH` for the DuckDB file and `BIRDCURVE_MODEL_RESULTS_DIR` for BirdCurve NL forecast CSVs.

## Tests

```bash
pixi run test                       # 31 backend integration tests
pixi run -e frontend npm run lint   # ESLint
pixi run -e frontend npm run build  # type-check + production build
```

## Docs (this site)

Docs build under `docs/sphinx/` and deploy to GitHub Pages via `.github/workflows/docs.yml` on every push to `main`.

Local build:

```bash
cd docs/sphinx
pip install -r requirements.txt
sphinx-build -b html . _build/html
open _build/html/index.html
```

Site URL: <https://maykthewessen.github.io/birdcurve-dashboard/>
