# Deployment

## Local development

All tooling is driven by `dashboard/Makefile` (Python and npm come from
pixi-managed global envs; there is no `pixi.toml` in this repo):

```bash
cd dashboard
make install          # backend deps (pixi global sync) + frontend (npm install)
make dev              # backend (:8000, granian) + frontend (:5173, vite) concurrently
```

Backend env (see `dashboard/backend/.env.example` for the full list):

- `BIRDCURVE_DUCKDB_PATH` — read-only DuckDB file
- `BIRDCURVE_MODEL_RESULTS_DIR` — BirdCurve NL model/forecast run directories
- `BIRDCURVE_HISTORICAL_FEATURES_PATH` — engineered-features glob (correlation matrix)
- `BIRDCURVE_EUR_USD_PATH`, `BIRDCURVE_COAL_API2_PATH` — optional sidecar CSV globs

## Tests

```bash
cd dashboard
make test-backend                    # backend tests (integration tests skip without the live DuckDB)

cd frontend
npm run lint
npm run build                        # tsc -b + vite build = the API contract check
```

CI (`.github/workflows/ci.yml`) runs the frontend lint + build and the
backend test suite on every push and pull request.

## Docs site (this site)

Built with **MkDocs Material** + **mkdocstrings**. Two deploy targets are configured:

### GitHub Pages (primary)

`.github/workflows/docs.yml` builds on every push to `main` and deploys via `actions/deploy-pages@v4`. Site at <https://maykthewessen.github.io/birdcurve-dashboard/>.

### ReadTheDocs (mirror)

`.readthedocs.yaml` at repo root tells RTD how to build the same site. Connect the repo on readthedocs.org once and it will publish to `birdcurve-dashboard.readthedocs.io`.

### Local build

```bash
pip install -r docs/requirements.txt
# Backend dev server already uses :8000 — bind docs to :8001 to avoid clashing.
mkdocs serve -a 127.0.0.1:8001    # live-reload dev server
mkdocs build --strict             # production build to ./site, fails on warnings
```
