"""
app/services/profile_store.py
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
Profile persistence for the VitalScan backend.

The frontend (``src/services/profileService.ts``) reads and updates the
signed-in user's profile via ``GET/PUT /api/profile`` with the Firebase UID in
the ``X-User-Id`` header. This module is the storage layer behind those routes:

  - a local JSON store by default (``ml-backend/data/profiles.json``,
    gitignored) keyed by user id — the zero-config development fallback,
    mirroring ``report_store.py``;
  - a Supabase ``profiles`` table when the client is configured, upserting on
    ``user_id`` so profiles are shared across devices.

The profile body is stored as a single JSON document (a jsonb column in
Supabase, a dict value in the local file) so the field set can evolve without
schema churn. Storage failures raise so the route can surface a 503.
"""
from __future__ import annotations

import json
import threading
import time
from pathlib import Path
from typing import Any, Optional

STORE_LOCK = threading.Lock()

DEFAULT_STORE_PATH = Path(__file__).resolve().parents[2] / "data" / "profiles.json"


def _read_file(path: Path) -> dict[str, dict]:
    if not path.exists():
        return {}
    try:
        with open(path, "r", encoding="utf-8") as fh:
            data = json.load(fh)
    except (json.JSONDecodeError, OSError):
        return {}
    return data if isinstance(data, dict) else {}


def _write_file(path: Path, records: dict[str, dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(records, fh, indent=2, ensure_ascii=False)


def _local_get(user_id: str, store_path: Path) -> Optional[dict]:
    with STORE_LOCK:
        return _read_file(store_path).get(user_id)


def _local_save(user_id: str, profile: dict, store_path: Path) -> dict:
    record = dict(profile)
    record["user_id"] = user_id
    record["updatedAt"] = time.strftime("%Y-%m-%dT%H:%M:%SZ")
    with STORE_LOCK:
        records = _read_file(store_path)
        records[user_id] = record
        _write_file(store_path, records)
    return record


def _supabase_get(user_id: str, client: Any) -> Optional[dict]:
    res = client.table("profiles").select("profile").eq("user_id", user_id).maybe_single().execute()
    if res and res.data and isinstance(res.data, dict):
        return res.data.get("profile")
    return None


def _supabase_save(user_id: str, profile: dict, client: Any) -> dict:
    res = client.table("profiles").upsert(
        {"user_id": user_id, "profile": profile, "updated_at": "now()"},
        on_conflict="user_id",
    ).execute()
    if res and res.data:
        row = res.data[0]
        return row.get("profile") or profile
    return profile


def get_profile(
    user_id: str,
    store_path: Optional[Path] = None,
    supabase_client: Optional[Any] = None,
) -> Optional[dict]:
    """Return the stored profile body for a user id, or None when absent."""
    if supabase_client is not None:
        return _supabase_get(user_id, supabase_client)
    return _local_get(user_id, store_path or DEFAULT_STORE_PATH)


def save_profile(
    user_id: str,
    profile: dict,
    store_path: Optional[Path] = None,
    supabase_client: Optional[Any] = None,
) -> dict:
    """Create or update (upsert) the profile for a user id; returns the stored
    profile body with the user id and an updatedAt timestamp."""
    if supabase_client is not None:
        return _supabase_save(user_id, profile, supabase_client)
    return _local_save(user_id, profile, store_path or DEFAULT_STORE_PATH)
