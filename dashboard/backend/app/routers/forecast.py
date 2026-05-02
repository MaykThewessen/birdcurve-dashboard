"""DA and ID3/Imbalance forecasts, annual statistics."""
from __future__ import annotations

import csv

import openpyxl
from fastapi import APIRouter, Query, Request, HTTPException

from ..downsampling import lttb_downsample
from ._helpers import get_engine_and_dir

router = APIRouter(prefix="/forecast", tags=["forecast"])


@router.get("/da")
async def get_da_forecast(
    request: Request,
    start: str = Query(...),
    end: str = Query(...),
    scenario: str = Query(...),
    max_points: int = Query(10000, ge=10, le=100000),
):
    engine, fdir = get_engine_and_dir(request, scenario)

    csv_path = list(fdir.glob("predictions_DA_hourly_*.csv"))
    if not csv_path:
        raise HTTPException(404, "predictions_DA_hourly CSV not found")

    # Handle both 'datetime_UTC' (v17+) and 'datetime' (older) column names
    _DATETIME_COL_CANDIDATES = ["datetime_UTC", "datetime"]

    data = []
    with open(csv_path[0]) as f:
        reader = csv.DictReader(f)
        fieldnames = reader.fieldnames or []
        dt_col = next((c for c in _DATETIME_COL_CANDIDATES if c in fieldnames), fieldnames[0] if fieldnames else "datetime_UTC")
        for row in reader:
            dt = row[dt_col]
            if dt < start or dt > end:
                continue
            actual_val = row.get("Price_actual", "")
            data.append({
                "datetime": dt,
                "price_actual": float(actual_val) if actual_val and actual_val != "" else None,
                "price_predicted": float(row["Price_pred_ensemble"]),
            })

    if len(data) > max_points:
        for i, d in enumerate(data):
            d["_idx"] = i
        data = lttb_downsample(data, "_idx", "price_predicted", max_points)
        for d in data:
            d.pop("_idx", None)

    return {
        "datetime": [d["datetime"] for d in data],
        "price_actual": [d["price_actual"] for d in data],
        "price_predicted": [d["price_predicted"] for d in data],
    }


@router.get("/id3-imbalance")
async def get_id3_imbalance(
    request: Request,
    start: str = Query(...),
    end: str = Query(...),
    scenario: str = Query(...),
    max_points: int = Query(10000, ge=10, le=100000),
):
    engine, fdir = get_engine_and_dir(request, scenario)

    data = engine.query_forecast_file(
        scenario,
        "predictions_DA_ID3_Imb_aFRR_FCR_quarterly_2023_2050",
        start, end,
        datetime_col="Datetime_UTC",
    )

    def _safe(v):
        """Convert NaN/NA pandas values to None for JSON serialization."""
        import math
        if v is None:
            return None
        try:
            if math.isnan(float(v)):
                return None
        except (TypeError, ValueError):
            pass
        return v

    result = []
    for d in data:
        result.append({
            "datetime": str(d.get("Datetime_UTC", "")),
            "da_price": _safe(d.get("Day-ahead_price")),
            "id3_price": _safe(d.get("ID3_price")),
            "afrr_up": _safe(d.get("aFRR_Energy_up_price")),
            "afrr_down": _safe(d.get("aFRR_Energy_down_price")),
            "imb_long": _safe(d.get("imb_long_price")),
            "imb_short": _safe(d.get("imb_short_price")),
            "reg_state": _safe(d.get("Regulation_State")),
        })

    if len(result) > max_points:
        for i, d in enumerate(result):
            d["_idx"] = i
        result = lttb_downsample(result, "_idx", "da_price", max_points)
        for d in result:
            d.pop("_idx", None)

    return {
        "datetime": [r["datetime"] for r in result],
        "da_price": [r["da_price"] for r in result],
        "id3_price": [r["id3_price"] for r in result],
        "afrr_up": [r["afrr_up"] for r in result],
        "afrr_down": [r["afrr_down"] for r in result],
        "imb_long": [r["imb_long"] for r in result],
        "imb_short": [r["imb_short"] for r in result],
        "reg_state": [r["reg_state"] for r in result],
    }


@router.get("/annual-stats")
async def get_annual_stats(
    request: Request,
    scenario: str = Query(...),
):
    engine, fdir = get_engine_and_dir(request, scenario)

    xlsx_files = list(fdir.glob("Annual_statistics_*.xlsx"))
    if not xlsx_files:
        raise HTTPException(404, "Annual_statistics xlsx not found")

    wb = openpyxl.load_workbook(xlsx_files[0], read_only=True, data_only=True)
    ws = wb[wb.sheetnames[0]]
    rows_data = list(ws.iter_rows(values_only=True))
    wb.close()

    if not rows_data:
        return {}

    years = [int(y) for y in rows_data[0][1:] if y is not None]

    metric_map = {}
    for row in rows_data[1:]:
        if row[0] is None:
            continue
        metric_name = str(row[0])
        values = [float(v) if v is not None else 0.0 for v in row[1:len(years) + 1]]
        metric_map[metric_name] = values

    return {
        "years": years,
        "avg_da": metric_map.get("Avg DA Price (€/MWh)", []),
        "std_da": metric_map.get("Std Dev DA Price (€/MWh)", []),
        "spread": metric_map.get("Avg Daily Spread (€/MWh)", []),
        "negative_hours": metric_map.get("Negative Hours (<€0)", []),
        "peak_hours": metric_map.get("Peak Hours (>€200)", []),
        "bess_2h": metric_map.get("BESS 2h DA Revenue (k€/MW/y)", []),
        "bess_4h": metric_map.get("BESS 4h DA Revenue (k€/MW/y)", []),
        "bess_8h": metric_map.get("BESS 8h DA Revenue (k€/MW/y)", []),
        "bess_id3": metric_map.get("BESS 2h ID3 Revenue (k€/MW/y)", []),
        "bess_afrr": metric_map.get("BESS 2h aFRR Energy Revenue (k€/MW/y)", []),
        "afrr_cap_rev": metric_map.get("aFRR Capacity Revenue (k€/MW/y)", []),
        "fcr_cap_rev": metric_map.get("FCR Capacity Revenue (k€/MW/y)", []),
        "solar_capture": metric_map.get("Solar Capture Price (€/MWh)", []),
        "solar_rev": metric_map.get("Solar PV Revenue (k€/MW/y)", []),
        "wind_rev": metric_map.get("Wind Revenue (k€/MW/y)", []),
        "demand_twh": metric_map.get("Annual Demand (TWh/y)", []),
    }
