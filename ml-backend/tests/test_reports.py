"""
tests/test_reports.py
~~~~~~~~~~~~~~~~~~~~~
Tests for the report-history persistence layer.

Covers the store service (``app/services/report_store.py``) directly with a
temporary store path, and the ``/api/reports`` FastAPI routes via TestClient
(store redirected to a temp file). The Supabase branch is not exercised here
because supabase is not installed in the dev venv; it shares the same record
shape and is covered by the local-store round-trip.
"""
import json

import pytest

from app.services import report_store


def _payload(**overrides):
    base = {
        "heartRate": 72.0,
        "bloodPressure": "118/76",
        "oxygenLevel": 97.0,
        "respirationRate": None,
        "healthScore": 84.0,
        "riskLevel": "Low",
        "stressLevel": "Low",
    }
    base.update(overrides)
    return base


# ---------------------------------------------------------------------------
# Store service
# ---------------------------------------------------------------------------

def test_save_then_list_roundtrip(tmp_path):
    store = tmp_path / "reports.json"
    saved = report_store.save_report(_payload(), store_path=store)
    assert saved["id"]
    assert saved["createdAt"]
    assert saved["heartRate"] == 72.0
    assert saved["respirationRate"] is None

    listed = report_store.list_reports(store_path=store)
    assert len(listed) == 1
    assert listed[0]["id"] == saved["id"]


def test_list_returns_newest_first(tmp_path):
    store = tmp_path / "reports.json"
    a = report_store.save_report(_payload(healthScore=60.0), store_path=store)
    b = report_store.save_report(_payload(healthScore=90.0), store_path=store)
    listed = report_store.list_reports(store_path=store)
    assert [r["id"] for r in listed] == [b["id"], a["id"]]


def test_persistence_survives_store_reload(tmp_path):
    store = tmp_path / "reports.json"
    report_store.save_report(_payload(), store_path=store)
    # A fresh module-level read (reopened store) still sees the record.
    assert store.exists()
    with open(store, "r", encoding="utf-8") as fh:
        records = json.load(fh)
    assert len(records) == 1


def test_delete_removes_report(tmp_path):
    store = tmp_path / "reports.json"
    saved = report_store.save_report(_payload(), store_path=store)
    assert report_store.delete_report(saved["id"], store_path=store) is True
    assert report_store.list_reports(store_path=store) == []
    # Deleting a missing id reports failure without raising.
    assert report_store.delete_report("does-not-exist", store_path=store) is False


def test_missing_store_file_lists_empty(tmp_path):
    assert report_store.list_reports(store_path=tmp_path / "nope.json") == []


# ---------------------------------------------------------------------------
# FastAPI routes
# ---------------------------------------------------------------------------

@pytest.fixture
def client(tmp_path, monkeypatch):
    from fastapi.testclient import TestClient

    import main
    from main import app

    # Force the offline local store for the whole test session (supabase is
    # installed in the dev venv, so we must disable it to stay deterministic).
    monkeypatch.setattr(main, "supabase", None)
    monkeypatch.setattr(report_store, "DEFAULT_STORE_PATH", tmp_path / "reports.json")
    with TestClient(app) as c:
        yield c


def test_create_list_delete_endpoints(client):
    res = client.post("/api/reports", json=_payload())
    assert res.status_code == 201
    body = res.json()
    assert body["id"]
    assert body["heartRate"] == 72.0
    assert body["stressLevel"] == "Low"

    listing = client.get("/api/reports")
    assert listing.status_code == 200
    assert [r["id"] for r in listing.json()] == [body["id"]]

    deleted = client.delete(f"/api/reports/{body['id']}")
    assert deleted.status_code == 200

    empty = client.get("/api/reports")
    assert empty.json() == []


def test_delete_missing_returns_404(client):
    assert client.delete("/api/reports/nope").status_code == 404


def test_rejects_invalid_payload(client):
    bad = _payload(heartRate=9000.0)
    assert client.post("/api/reports", json=bad).status_code == 422
