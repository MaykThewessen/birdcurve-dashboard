---
hide-toc: false
---

# birdcurve-dashboard

Interactive dashboard for Dutch electricity market data and **BirdCurve NL** price forecasts.

```{toctree}
:hidden:
:caption: Guides

overview
architecture
deployment
```

```{toctree}
:hidden:
:caption: Reference

api/index
```

```{toctree}
:hidden:
:caption: Project

GitHub <https://github.com/MaykThewessen/birdcurve-dashboard>
BirdCurve NL <https://github.com/MaykThewessen/BirdCurve_NL>
```

## What's here

::::{grid} 2
:gutter: 3

:::{grid-item-card} 📖 Overview
:link: overview
:link-type: doc

High-level tour of the six pages and what each one shows.
:::

:::{grid-item-card} 🏗️ Architecture
:link: architecture
:link-type: doc

FastAPI + DuckDB backend, React 19 + Vite 7 frontend, LTTB downsampling.
:::

:::{grid-item-card} 🚀 Deployment
:link: deployment
:link-type: doc

How to build, run, and ship the dashboard locally or in CI.
:::

:::{grid-item-card} 🔧 API Reference
:link: api/index
:link-type: doc

Auto-generated reference for every backend module and FastAPI router.
:::

::::

## Quick start

```bash
git clone https://github.com/MaykThewessen/birdcurve-dashboard
cd birdcurve-dashboard
pixi install
pixi run dev
```

Backend serves on `:8000`, frontend on `:5173`.
