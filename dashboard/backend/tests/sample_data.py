"""Deterministic synthetic data for API tests and browser verification."""
from pathlib import Path
import json

import duckdb
import numpy as np
import openpyxl
import pandas as pd

from app.config import Settings


def create_sample_data(root: Path) -> Settings:
    root.mkdir(parents=True, exist_ok=True)
    database = root / "test.duckdb"
    models = root / "model_results"
    production = models / "Production_Ensemble_20260101_000000"
    forecast = models / "Forecast_20260101_000000_v17_Central_Test"
    production.mkdir(parents=True, exist_ok=True)
    forecast.mkdir(parents=True, exist_ok=True)
    timestamps = pd.date_range("2023-01-01", "2027-01-01", freq="h", inclusive="left", tz="UTC")
    phase = np.arange(len(timestamps))
    prices = 60 + 80 * np.sin(phase / 24)
    hourly = pd.DataFrame({"timestamp_utc": timestamps, "DA_price__DA_price": prices})
    quarter = pd.DataFrame({"timestamp_utc": timestamps})
    for column in (
        "Load_NL__Actual_Load_MW", "NED_PV__PV", "NED_Wind_Onshore__Wind_Onshore",
        "NED_Wind_Offshore__Wind_Offshore", "CrossBorder_NL__Total_Net",
        "Imbalance_NL__Price_aFRR_energy_up", "Imbalance_NL__Price_aFRR_energy_down",
        "Imbalance_NL__Price_imb_long", "Imbalance_NL__Price_imb_short",
    ):
        quarter[column] = prices
    capacity = pd.DataFrame({"timestamp_utc": timestamps[::4]})
    for column in ("aFRR_capacity_price__Up", "aFRR_capacity_price__Down",
                   "aFRR_capacity_volume__Up", "aFRR_capacity_volume__Down",
                   "FCR_capacity_price__price", "FCR_capacity_volume__symmetric_MW"):
        capacity[column] = 10.0
    daily = pd.DataFrame({
        "timestamp_utc": timestamps[::24], "Gas_TTF__price": 30.0,
        "CO2_EUA__price": 70.0, "CO2_EUA__EUR_ton": 70.0,
    })
    provenance = pd.DataFrame({
        "table_name": ["ts_hourly"], "source": ["synthetic-test-data"],
        "timestamp_utc": [timestamps[-1]], "ingested_at": [timestamps[-1]],
    })
    with duckdb.connect(str(database)) as connection:
        connection.execute("SET TimeZone='UTC'")
        for name, frame in {"ts_hourly": hourly, "ts_15min": quarter, "ts_daily": daily,
                            "ts_4hourly": capacity, "provenance": provenance}.items():
            connection.register("input_frame", frame)
            connection.execute(f'CREATE TABLE "{name}" AS SELECT * FROM input_frame')
            connection.unregister("input_frame")

    predictions = pd.DataFrame({
        "datetime_UTC": timestamps, "Price_actual": prices,
        "Price_pred_ensemble": prices + 2,
    })
    predictions.to_csv(forecast / "predictions_DA_hourly_test.csv", index=False)
    for split in ("training", "validation"):
        predictions.rename(columns={"datetime_UTC": "datetime"}).to_csv(
            production / f"predictions_{split}.csv", index=False,
        )
    balancing = pd.DataFrame({"Datetime_UTC": timestamps, "Regulation_State": phase % 4 - 1})
    for column in ("Day-ahead_price", "ID3_price", "aFRR_Energy_up_price",
                   "aFRR_Energy_down_price", "imb_long_price", "imb_short_price"):
        balancing[column] = prices
    balancing.to_feather(forecast / "predictions_DA_ID3_Imb_aFRR_FCR_quarterly_2023_2050.feather")
    metrics = {"training": {"mae": 2.0}, "validation": {"mae": 2.0, "by_price_range": [
        {"range": band, "samples": 100, "mae": 2.0} for band in "ABCD"
    ]}}
    (production / "metrics.json").write_text(json.dumps(metrics))
    years = np.arange(2023, 2051)
    pd.DataFrame({"Year": years, "Scenario": "SYNTHETIC TEST DATA", "Solar PV": 20,
                  "Gas TTF": 30}).to_csv(forecast / "BirdSystem_Futures_test.csv", index=False)
    workbook = openpyxl.Workbook()
    sheet = workbook.active
    sheet.append(["Metric", *years.tolist()])
    for metric in ("Avg DA Price (€/MWh)", "aFRR Capacity Revenue (k€/MW/y)",
                   "FCR Capacity Revenue (k€/MW/y)", "BESS 2h aFRR Energy Revenue (k€/MW/y)"):
        sheet.append([metric, *([10.0] * len(years))])
    workbook.save(forecast / "Annual_statistics_test.xlsx")
    workbook.close()
    return Settings(duckdb_path=database, model_results_dir=models,
                    eur_usd_path=root / "absent-fx.csv", coal_api2_path=root / "absent-coal.csv",
                    historical_features_path=root / "absent-features.parquet")
