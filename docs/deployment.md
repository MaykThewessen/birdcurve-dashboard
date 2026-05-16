# Deployment

## Local development

```bash
pixi install
pixi run dev          # backend (:8000) + frontend (:5173) concurrently
```

Backend env:

- `BIRDCURVE_DB_PATH` — read-only DuckDB file
- `BIRDCURVE_MODEL_RESULTS_DIR` — BirdCurve NL forecast CSVs

## Tests

```bash
pixi run test                        # 31 backend integration tests
pixi run -e frontend npm run lint
pixi run -e frontend npm run build
```

## Docs site (this site)

Built with **MkDocs Material** + **mkdocstrings**. Two deploy targets are configured:

### GitHub Pages (primary)

`.github/workflows/docs.yml` builds on every push to `main` and deploys via `actions/deploy-pages@v4`. Site at <https://maykthewessen.github.io/birdcurve-dashboard/>.

### ReadTheDocs (mirror)

`.readthedocs.yaml` at repo root tells RTD how to build the same site. Connect the repo on readthedocs.org once and it will publish to `birdcurve-dashboard.readthedocs.io`.

### Local build

```bash
pip install -r docs/requirements.txt
mkdocs serve           # live-reload dev server at :8001
mkdocs build --strict  # production build to ./site, fails on warnings
```
