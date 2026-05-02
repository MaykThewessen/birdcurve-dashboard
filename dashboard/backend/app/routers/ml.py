"""ML model performance: metrics, predictions, feature importance, correlation."""
from __future__ import annotations

import csv

from fastapi import APIRouter, Query, Request, HTTPException

from ..downsampling import lttb_downsample

router = APIRouter(prefix="/ml", tags=["ml"])


@router.get("/metrics")
async def get_metrics(request: Request):
    engine = request.app.state.engine
    metrics = engine.get_cached("metrics.json")
    config = engine.get_cached("ensemble_config.json")
    features = engine.get_cached("feature_list")

    if not metrics:
        raise HTTPException(404, "No metrics.json found in production model")

    training = metrics.get("training", {})
    validation = metrics.get("validation", {})
    curve = metrics.get("curve_alignment", {})

    # Price bands are stored inside training/validation under 'by_price_range'
    price_bands = []
    for band in validation.get("by_price_range", []):
        price_bands.append({
            "name": band.get("range", band.get("name", "")),
            "count": band.get("samples", 0),
            "pct": round(band.get("pct", 0), 1),
            "mae": round(band.get("mae", 0), 2),
            "correlation": round(band.get("correlation", 0), 3),
        })

    feature_importance = _get_feature_importance(engine)

    return {
        "training": {
            "mae": round(training.get("mae", 0), 2),
            "rmse": round(training.get("rmse", 0), 2),
            "r2": round(training.get("r2", 0), 4),
            "correlation": round(training.get("correlation", 0), 4),
            "samples": training.get("samples", 0),
        },
        "validation": {
            "mae": round(validation.get("mae", 0), 2),
            "rmse": round(validation.get("rmse", 0), 2),
            "r2": round(validation.get("r2", 0), 4),
            "correlation": round(validation.get("correlation", 0), 4),
            "samples": validation.get("samples", 0),
        },
        "price_bands": price_bands,
        "bess": {
            "capture_rate": round(curve.get("mean_bess_capture_rate", 0), 4),
            "spearman": round(curve.get("mean_spearman_r", 0), 4),
            "spread_mae": round(metrics.get("spread_mae", 0), 2),
        },
        "weights": {
            "lightgbm": config.get("weight_lightgbm", 0.5) if config else 0.5,
            "catboost": config.get("weight_catboost", 0.5) if config else 0.5,
        },
        "feature_importance": feature_importance,
        "features": features or [],
    }


def _get_feature_importance(engine) -> list[dict]:
    prod = engine.latest_production_model
    if not prod:
        return []

    lgb_path = prod / "lgb_model.txt"
    if not lgb_path.exists():
        return []

    features = engine.get_cached("feature_list") or []
    if not features:
        return []

    try:
        import lightgbm as lgb
        model = lgb.Booster(model_file=str(lgb_path))
        importance = model.feature_importance(importance_type="gain")
        pairs = sorted(zip(features, importance), key=lambda x: x[1], reverse=True)
        return [{"name": n, "importance": round(float(v), 1)} for n, v in pairs[:30]]
    except Exception:
        return []


@router.get("/predictions")
async def get_predictions(
    request: Request,
    set: str = Query("validation", pattern="^(validation|training)$"),
    max_points: int = Query(5000, ge=10, le=50000),
):
    engine = request.app.state.engine
    prod = engine.latest_production_model
    if not prod:
        raise HTTPException(404, "No production model found")

    csv_path = prod / f"predictions_{set}.csv"
    if not csv_path.exists():
        raise HTTPException(404, f"predictions_{set}.csv not found")

    data = []
    with open(csv_path) as f:
        reader = csv.DictReader(f)
        for row in reader:
            data.append({
                "datetime": row["datetime"],
                "actual": float(row["Price_actual"]),
                "predicted": float(row["Price_pred_ensemble"]),
            })

    if len(data) > max_points:
        for i, d in enumerate(data):
            d["_idx"] = i
        data = lttb_downsample(data, "_idx", "actual", max_points)
        for d in data:
            d.pop("_idx", None)

    return {
        "datetime": [d["datetime"] for d in data],
        "actual": [d["actual"] for d in data],
        "predicted": [d["predicted"] for d in data],
        "residuals": [round(d["actual"] - d["predicted"], 2) for d in data],
    }


@router.get("/correlation-matrix")
async def get_correlation_matrix(request: Request):
    """Feature correlation matrix from training data. Cached after first request."""
    engine = request.app.state.engine

    cached = engine.get_cached("correlation_matrix")
    if cached:
        return cached

    import pandas as pd

    features_path = list(engine._settings.project_root.glob("Historical_data_features_engineered_*.feather"))
    if not features_path:
        raise HTTPException(404, "Historical features file not found")

    df = pd.read_feather(features_path[0])
    feature_names = engine.get_cached("feature_list") or []

    available = [f for f in feature_names[:20] if f in df.columns]
    if not available:
        return {"features": [], "matrix": []}

    corr = df[available].corr().round(3)
    result = {
        "features": available,
        "matrix": corr.values.tolist(),
    }
    engine._small_files_cache["correlation_matrix"] = result
    return result


@router.get("/price-distributions")
async def get_price_distributions(
    request: Request,
    source: str = Query("historical", pattern="^(historical|forecast)$"),
    scenario: str = Query(""),
):
    """Price distribution statistics by year for violin plots."""
    import pandas as pd
    import numpy as np
    from scipy.stats import gaussian_kde

    engine = request.app.state.engine

    if source == "historical":
        sql = """
            SELECT
                EXTRACT(year FROM timestamp_utc::TIMESTAMP) as year,
                value
            FROM sqlite_db.ts_hourly
            WHERE source = 'DA_price' AND column_name = 'DA_price'
            ORDER BY timestamp_utc
        """
        rows = engine.query(sql)
        df = pd.DataFrame(rows)
    else:
        if not scenario:
            raise HTTPException(400, "scenario required for forecast distributions")
        data = engine.query_forecast_file(scenario, "predictions_DA_hourly_*", datetime_col="datetime_UTC")
        df = pd.DataFrame(data)
        df["year"] = pd.to_datetime(df["datetime_UTC"]).dt.year
        df["value"] = df["Price_pred_ensemble"]

    if df.empty:
        return {"years": [], "distributions": []}

    distributions = []
    for year, group in df.groupby("year"):
        vals = group["value"].dropna()
        if len(vals) < 10:
            continue

        try:
            kde = gaussian_kde(vals, bw_method=0.3)
            x_range = np.linspace(vals.min() - 20, vals.max() + 20, 100)
            kde_y = kde(x_range).tolist()
        except Exception:
            x_range = []
            kde_y = []

        distributions.append({
            "year": int(year),
            "min": round(float(vals.min()), 1),
            "q1": round(float(vals.quantile(0.25)), 1),
            "median": round(float(vals.median()), 1),
            "q3": round(float(vals.quantile(0.75)), 1),
            "max": round(float(vals.max()), 1),
            "mean": round(float(vals.mean()), 1),
            "std": round(float(vals.std()), 1),
            "kde_x": [round(float(x), 1) for x in x_range] if len(x_range) > 0 else [],
            "kde_y": [round(float(y), 4) for y in kde_y],
        })

    return {
        "years": [d["year"] for d in distributions],
        "distributions": distributions,
    }
