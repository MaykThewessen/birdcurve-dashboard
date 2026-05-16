# birdcurve-dashboard

Interactive dashboard for Dutch electricity market data and **BirdCurve NL** price forecasts.

<div class="grid cards" markdown>

- :material-book-open-page-variant: **[Overview](overview.md)** — tour of the six pages and what each one shows
- :material-sitemap: **[Architecture](architecture.md)** — FastAPI + DuckDB backend, React 19 + Vite 7 frontend
- :material-rocket-launch: **[Deployment](deployment.md)** — build, run, ship locally or in CI
- :material-api: **[API reference](reference/index.md)** — auto-generated docs for every backend module

</div>

## Quick start

```bash
git clone https://github.com/MaykThewessen/birdcurve-dashboard
cd birdcurve-dashboard
pixi install
pixi run dev
```

Backend serves on `:8000`, frontend on `:5173`.
