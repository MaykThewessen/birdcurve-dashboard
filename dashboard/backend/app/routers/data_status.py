"""Data freshness / provenance — surfaces what was last ingested for each source."""
from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Request, Response

router = APIRouter(prefix="/data-status", tags=["data-status"])


@router.get("")
async def get_data_status(request: Request, response: Response):
    """Per-source ingestion + data freshness from the provenance table.

    Returns one row per (table, source) with the latest data timestamp,
    when it was last ingested, the resulting lag in hours, and a status
    bucket (fresh / warn / stale) so the UI can colour-code at a glance.

    Provenance comes from a sister table the upstream BirdCurve NL pipeline
    populates after each ingestion run; previously the dashboard ignored it.
    """
    engine = request.app.state.engine

    rows = engine.query(
        """
        SELECT table_name, source,
               MAX(timestamp_utc) AS latest_data_utc,
               MAX(ingested_at)   AS last_ingest_utc,
               COUNT(*)           AS rows_total
        FROM provenance
        GROUP BY table_name, source
        ORDER BY MAX(timestamp_utc) DESC
        """
    )

    now = datetime.now(timezone.utc)
    sources = []
    for r in rows:
        latest = r["latest_data_utc"]
        ingested = r["last_ingest_utc"]
        if latest is None:
            continue

        # _records_from_df has already localised the timestamp to UTC for us.
        lag_hours = (now - latest).total_seconds() / 3600

        if lag_hours <= 24:
            status = "fresh"
        elif lag_hours <= 24 * 7:
            status = "warn"
        else:
            status = "stale"

        sources.append({
            "table": r["table_name"],
            "source": r["source"],
            "latest_data_utc": str(latest),
            "last_ingest_utc": str(ingested) if ingested else None,
            "lag_hours": round(lag_hours, 1),
            "rows_total": r["rows_total"],
            "status": status,
        })

    counts = {"fresh": 0, "warn": 0, "stale": 0}
    for s in sources:
        counts[s["status"]] += 1

    response.headers["Cache-Control"] = "public, max-age=300"
    return {
        "as_of_utc": now.isoformat(),
        "sources": sources,
        "summary": counts,
    }
