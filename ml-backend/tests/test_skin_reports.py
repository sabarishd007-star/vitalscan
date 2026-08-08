"""
tests/test_skin_reports.py
~~~~~~~~~~~~~~~~~~~~~~~~~~
Tests for the skin-scan history persistence layer and its FastAPI routes.

Covers the store service (``app/services/skin_report_store.py``) with a
temporary store path, and the ``/api/skin-reports`` routes via TestClient.
Like test_reports.py, the Supabase branch is not exercised here; it shares the
same record shape and is covered by the local-store round-trip. The key
behaviour pinned here is per-user isolation: every read/write/delete is scoped
to the Firebase UID supplied in the X-User-Id header.
"""
import json

import pytest

from app.services import skin_report_store

USER_A = "firebase-uid-alice"
USER_B = "firebase-uid-bob"


def _payload(**overrides):
    base = {
        "skin_type": "Oily",
        "acne_level": 3.2,
        "dark_circles": 5.0,
        "oiliness": 7.1,
        "dryness": 2.0,
        "redness": 1.5,
        "pore_visibility": 4.4,
        "pigmentation": 3.3,
        "texture": 2.2,
        "glow_score": 6.0,
        "hydration": 8.0,
        "overall_score": 7.4,
        "recommendations": {"cleanser": "gentle gel cleanser"},
    }
    base.update(overrides)
    return base


# ---------------------------------------------------------------------------
# Store service
# ---------------------------------------------------------------------------

def test_save_then_list_roundtrip(tmp_path):
    store = tmp_path / "skin_reports.json"
    saved = skin_report_store.save_skin_report(USER_A, _payload(), store_path=store)
    assert saved["id"]
    assert saved["user_id"] == USER_A
    assert saved["skin_type"] == "Oily"
    assert saved["recommendations"]["cleanser"] == "gentle gel cleanser"

    listed = skin_report_store.list_skin_reports(USER_A, store_path=store)
    assert len(listed) == 1
    assert listed[0]["id"] == saved["id"]


def test_users_are_isolated(tmp_path):
    store = tmp_path / "skin_reports.json"
    alice = skin_report_store.save_skin_report(USER_A, _payload(), store_path=store)
    skin_report_store.save_skin_report(USER_B, _payload(skin_type="Dry"), store_path=store)

    assert [r["id"] for r in skin_report_store.list_skin_reports(USER_A, store_path=store)] == [alice["id"]]
    assert [r["skin_type"] for r in skin_report_store.list_skin_reports(USER_B, store_path=store)] == ["Dry"]


def test_list_returns_newest_first(tmp_path):
    store = tmp_path / "skin_reports.json"
    a = skin_report_store.save_skin_report(USER_A, _payload(overall_score=6.0), store_path=store)
    b = skin_report_store.save_skin_report(USER_A, _payload(overall_score=9.0), store_path=store)
    listed = skin_report_store.list_skin_reports(USER_A, store_path=store)
    assert [r["id"] for r in listed] == [b["id"], a["id"]]


def test_delete_only_removes_own_report(tmp_path):
    store = tmp_path / "skin_reports.json"
    mine = skin_report_store.save_skin_report(USER_A, _payload(), store_path=store)
    theirs = skin_report_store.save_skin_report(USER_B, _payload(), store_path=store)

    # Bob cannot delete Alice's report.
    assert skin_report_store.delete_skin_report(USER_B, mine["id"], store_path=store) is False
    assert len(skin_report_store.list_skin_reports(USER_A, store_path=store)) == 1

    # Alice can delete her own.
    assert skin_report_store.delete_skin_report(USER_A, mine["id"], store_path=store) is True
    assert skin_report_store.list_skin_reports(USER_A, store_path=store) == []
    assert skin_report_store.list_skin_reports(USER_B, store_path=store) == [theirs]


def test_missing_store_file_lists_empty(tmp_path):
    assert skin_report_store.list_skin_reports(USER_A, store_path=tmp_path / "nope.json") == []


# ---------------------------------------------------------------------------
# FastAPI routes
# ---------------------------------------------------------------------------

@pytest.fixture
def client(tmp_path, monkeypatch):
    from fastapi.testclient import TestClient

    import main
    from main import app

    monkeypatch.setattr(main, "supabase", None)
    monkeypatch.setattr(skin_report_store, "DEFAULT_STORE_PATH", tmp_path / "skin_reports.json")
    with TestClient(app) as c:
        yield c


def test_create_list_delete_endpoints(client):
    res = client.post("/api/skin-reports", json=_payload(), headers={"X-User-Id": USER_A})
    assert res.status_code == 201
    body = res.json()
    assert body["id"]
    assert body["user_id"] == USER_A
    assert body["skin_type"] == "Oily"

    listing = client.get("/api/skin-reports", headers={"X-User-Id": USER_A})
    assert listing.status_code == 200
    assert [r["id"] for r in listing.json()] == [body["id"]]

    deleted = client.delete(f"/api/skin-reports/{body['id']}", headers={"X-User-Id": USER_A})
    assert deleted.status_code == 200

    empty = client.get("/api/skin-reports", headers={"X-User-Id": USER_A})
    assert empty.json() == []


def test_routes_scope_to_user(client):
    mine = client.post("/api/skin-reports", json=_payload(), headers={"X-User-Id": USER_A}).json()
    client.post("/api/skin-reports", json=_payload(skin_type="Dry"), headers={"X-User-Id": USER_B}).json()

    # Alice sees only her own report.
    listing = client.get("/api/skin-reports", headers={"X-User-Id": USER_A}).json()
    assert [r["id"] for r in listing] == [mine["id"]]

    # Bob cannot delete Alice's report.
    assert client.delete(f"/api/skin-reports/{mine['id']}", headers={"X-User-Id": USER_B}).status_code == 404


def test_missing_user_header_rejected(client):
    assert client.post("/api/skin-reports", json=_payload()).status_code == 400
    assert client.get("/api/skin-reports").status_code == 400
    assert client.delete("/api/skin-reports/some-id").status_code == 400
