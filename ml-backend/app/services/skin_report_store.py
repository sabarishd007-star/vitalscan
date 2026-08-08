"""
app/services/skin_report_store.py
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
Skin-scan history persistence for the VitalScan backend.

Mirrors report_store.py. The frontend previously wrote ``skin_reports``
directly with the Supabase anon key; because auth is Firebase (not Supabase),
RLS ``auth.uid()`` can never match the browser's anon key, so per-user rows
cannot be protected with a policy alone.

Instead the browser now calls ``POST/GET/DELETE /api/skin-reports`` with an
``X-User-Id`` header (Firebase UID). The backend writes through the service
role (which bypasses RLS) and filters every query by ``user_id``, and the
``skin_reports`` table has no anon-visible policies at all. The store layer is
shared, so an authenticated user can only ever see their own rows.

Persistence is best-effort on the request path — a store failure raises so the
route can surface a 503, matching the frontend's non-fatal error handling.
"""
from __future__ import annotations

import json
import threading
import time
import uuid
from pathlib import Path
from typing import Any, Optional

STORE_LOCK = threading.Lock()

DEFAULT_STORE_PATH = Path(__file__).resolve().parents[2] / "data" / "skin_reports.json"

# snake_case columns shared by the local fallback and the Supabase table.
RECORD_COLUMNS = [
    "skin_type", "acne_level", "dark_circles", "oiliness", "dryness",
    "redness", "pore_visibility", "pigmentation", "texture", "glow_score",
    "hydration", "overall_score", "recommendations",
]


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


def _clean_report(report: dict) -> dict:
    return {col: report.get(col) for col in RECORD_COLUMNS}


def _local_save(user_id: str, report: dict, store_path: Path) -> dict:
    record = {
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "created_at": time.strftime("%Y-%m-%dT%H:%M:%SZ"),
        **_clean_report(report),
    }
    with STORE_LOCK:
        records = _read_file(store_path)
        records.insert(0, record)
        _write_file(store_path, records)
    return record


def _local_list(user_id: str, store_path: Path) -> list[dict]:
    with STORE_LOCK:
        records = _read_file(store_path)
    return [r for r in records if r.get("user_id") == user_id]


def _local_delete(user_id: str, report_id: str, store_path: Path) -> bool:
    with STORE_LOCK:
        records = _read_file(store_path)
        kept = [r for r in records
                if not (r.get("user_id") == user_id and r.get("id") == report_id)]
        if len(kept) == len(records):
            return False
        _write_file(store_path, kept)
    return True


def _supabase_save(user_id: str, report: dict, client: Any) -> dict:
    res = client.table("skin_reports").insert({
        "user_id": user_id,
        **_clean_report(report),
    }).execute()
    rows = res.data if res and res.data else []
    return rows[0] if rows else {"user_id": user_id, **_clean_report(report)}


def _supabase_list(user_id: str, client: Any) -> list[dict]:
    res = (client.table("skin_reports")
           .select("*")
           .eq("user_id", user_id)
           .order("created_at", desc=True)
           .execute())
    return res.data if res and res.data else []


def _supabase_delete(user_id: str, report_id: str, client: Any) -> bool:
    res = (client.table("skin_reports")
           .delete()
           .eq("user_id", user_id)
           .eq("id", report_id)
           .execute())
    return bool(res and res.data)


def save_skin_report(
    user_id: str,
    report: dict,
    store_path: Optional[Path] = None,
    supabase_client: Optional[Any] = None,
) -> dict:
    """Persist a scan report for one user; returns the stored record."""
    if supabase_client is not None:
        return _supabase_save(user_id, report, supabase_client)
    return _local_save(user_id, report, store_path or DEFAULT_STORE_PATH)


def list_skin_reports(
    user_id: str,
    store_path: Optional[Path] = None,
    supabase_client: Optional[Any] = None,
) -> list[dict]:
    """Return one user's scan reports, newest first."""
    if supabase_client is not None:
        return _supabase_list(user_id, supabase_client)
    return _local_list(user_id, store_path or DEFAULT_STORE_PATH)


def delete_skin_report(
    user_id: str,
    report_id: str,
    store_path: Optional[Path] = None,
    supabase_client: Optional[Any] = None,
) -> bool:
    """Delete one of a user's reports; False when no such id exists."""
    if supabase_client is not None:
        return _supabase_delete(user_id, report_id, supabase_client)
    return _local_delete(user_id, report_id, store_path or DEFAULT_STORE_PATH)
