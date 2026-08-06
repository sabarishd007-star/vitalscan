"""
app/services/report_store.py
~~~~~~~~~~~~~~~~~~~~~~~~~~~~
Report-history persistence for the VitalScan backend.

The frontend (``src/services/reportService.ts``) calls ``POST/GET/DELETE`` on
``/api/reports``. This module is the storage layer behind those routes:

  - a local JSON file store by default (``ml-backend/data/reports.json``,
    gitignored) so report history works with zero external configuration;
  - a Supabase ``report_history`` table when the client is configured,
    mirroring the optional ``skin_analyses`` persistence already in main.py.

Reports are plain records: ``id`` (uuid4), ``createdAt`` (ISO-8601) plus the
measurement payload from the frontend. Persistence is best-effort on the
request path — a store failure raises so the route can surface a 503, matching
the frontend's non-fatal error handling.
"""
from __future__ import annotations

import json
import threading
import time
import uuid
from pathlib import Path
from typing import Any, Optional

STORE_LOCK = threading.Lock()

DEFAULT_STORE_PATH = Path(__file__).resolve().parents[2] / "data" / "reports.json"


def _read_file(path: Path) -> list[dict]:
    if not path.exists():
        return []
    try:
        with open(path, "r", encoding="utf-8") as fh:
            data = json.load(fh)
    except (json.JSONDecodeError, OSError):
        return []
    return data if isinstance(data, list) else []


def _write_file(path: Path, records: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(records, fh, indent=2, ensure_ascii=False)


def _local_save(report: dict, store_path: Path) -> dict:
    record = {
        "id": report.get("id") or str(uuid.uuid4()),
        "createdAt": report.get("createdAt") or time.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "heartRate": report.get("heartRate"),
        "bloodPressure": report.get("bloodPressure"),
        "oxygenLevel": report.get("oxygenLevel"),
        "respirationRate": report.get("respirationRate"),
        "healthScore": report.get("healthScore"),
        "riskLevel": report.get("riskLevel"),
        "stressLevel": report.get("stressLevel") or "Unknown",
    }
    with STORE_LOCK:
        records = _read_file(store_path)
        records.insert(0, record)
        _write_file(store_path, records)
    return record


def _local_list(store_path: Path) -> list[dict]:
    with STORE_LOCK:
        records = _read_file(store_path)
    records.sort(key=lambda r: r.get("createdAt") or "", reverse=True)
    return records


def _local_delete(report_id: str, store_path: Path) -> bool:
    with STORE_LOCK:
        records = _read_file(store_path)
        kept = [r for r in records if r.get("id") != report_id]
        if len(kept) == len(records):
            return False
        _write_file(store_path, kept)
    return True


def _supabase_save(report: dict, client: Any) -> dict:
    payload = {
        "heartRate": report.get("heartRate"),
        "bloodPressure": report.get("bloodPressure"),
        "oxygenLevel": report.get("oxygenLevel"),
        "respirationRate": report.get("respirationRate"),
        "healthScore": report.get("healthScore"),
        "riskLevel": report.get("riskLevel"),
        "stressLevel": report.get("stressLevel") or "Unknown",
    }
    res = client.table("report_history").insert(payload).execute()
    rows = res.data if res and res.data else []
    return rows[0] if rows else payload


def _supabase_list(client: Any) -> list[dict]:
    res = client.table("report_history").select("*").order("created_at", desc=True).execute()
    return res.data if res and res.data else []


def _supabase_delete(report_id: str, client: Any) -> bool:
    res = client.table("report_history").delete().eq("id", report_id).execute()
    return bool(res and res.data)


def save_report(
    report: dict,
    store_path: Optional[Path] = None,
    supabase_client: Optional[Any] = None,
) -> dict:
    """Persist a report payload; returns the stored record (with id/createdAt)."""
    if supabase_client is not None:
        return _supabase_save(report, supabase_client)
    return _local_save(report, store_path or DEFAULT_STORE_PATH)


def list_reports(
    store_path: Optional[Path] = None,
    supabase_client: Optional[Any] = None,
) -> list[dict]:
    """Return stored reports, newest first."""
    if supabase_client is not None:
        return _supabase_list(supabase_client)
    return _local_list(store_path or DEFAULT_STORE_PATH)


def delete_report(
    report_id: str,
    store_path: Optional[Path] = None,
    supabase_client: Optional[Any] = None,
) -> bool:
    """Delete a report by id; returns False when no such id exists."""
    if supabase_client is not None:
        return _supabase_delete(report_id, supabase_client)
    return _local_delete(report_id, store_path or DEFAULT_STORE_PATH)
