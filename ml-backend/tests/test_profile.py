"""
tests/test_profile.py
~~~~~~~~~~~~~~~~~~~~~
Tests for the user-profile persistence layer (``GET/PUT /api/profile``).

Covers the store service (``app/services/profile_store.py``) directly with a
temporary store path, and the FastAPI routes via TestClient (store redirected
to a temp file). The Supabase branch shares the same record shape and is not
exercised here because supabase is not installed in the dev venv; the local
round-trip covers the schema the upsert writes.
"""
import json

import pytest

from app.services import profile_store


def _payload(**overrides):
    base = {
        "displayName": "Ada Lovelace",
        "dateOfBirth": "1990-04-01",
        "sex": "female",
        "heightCm": 168.0,
        "weightKg": 60.0,
        "activityLevel": "moderate",
        "conditions": ["asthma"],
        "medications": ["ventolin"],
        "allergies": ["penicillin"],
        "emergencyContacts": [
            {"name": "Grace Hopper", "relationship": "Partner", "phone": "555-0100"}
        ],
        "healthTargets": ["better sleep", "lower stress"],
        "notificationRules": {"email": True, "sms": False},
        "reportOptions": {"anonymize": True},
    }
    base.update(overrides)
    return base


# ---------------------------------------------------------------------------
# Store service
# ---------------------------------------------------------------------------

def test_save_then_get_roundtrip(tmp_path):
    store = tmp_path / "profiles.json"
    saved = profile_store.save_profile("uid-1", _payload(), store_path=store)
    assert saved["user_id"] == "uid-1"
    assert saved["updatedAt"]
    assert saved["displayName"] == "Ada Lovelace"
    assert saved["emergencyContacts"][0]["name"] == "Grace Hopper"

    fetched = profile_store.get_profile("uid-1", store_path=store)
    assert fetched == saved
    assert fetched["notificationRules"] == {"email": True, "sms": False}


def test_missing_profile_returns_none(tmp_path):
    assert profile_store.get_profile("nobody", store_path=tmp_path / "profiles.json") is None


def test_upsert_overwrites_previous(tmp_path):
    store = tmp_path / "profiles.json"
    profile_store.save_profile("uid-1", _payload(displayName="First"), store_path=store)
    updated = profile_store.save_profile("uid-1", _payload(displayName="Second"), store_path=store)
    assert updated["displayName"] == "Second"
    assert profile_store.get_profile("uid-1", store_path=store)["displayName"] == "Second"


def test_users_are_isolated(tmp_path):
    store = tmp_path / "profiles.json"
    profile_store.save_profile("uid-a", _payload(displayName="A"), store_path=store)
    profile_store.save_profile("uid-b", _payload(displayName="B"), store_path=store)
    assert profile_store.get_profile("uid-b", store_path=store)["displayName"] == "B"
    assert profile_store.get_profile("uid-a", store_path=store)["displayName"] == "A"


def test_persistence_survives_store_reload(tmp_path):
    store = tmp_path / "profiles.json"
    profile_store.save_profile("uid-1", _payload(), store_path=store)
    assert store.exists()
    with open(store, "r", encoding="utf-8") as fh:
        records = json.load(fh)
    assert records["uid-1"]["displayName"] == "Ada Lovelace"


def test_missing_store_file_reads_empty(tmp_path):
    assert profile_store.get_profile("uid-1", store_path=tmp_path / "nope.json") is None


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
    monkeypatch.setattr(profile_store, "DEFAULT_STORE_PATH", tmp_path / "profiles.json")
    with TestClient(app) as c:
        yield c


def test_put_then_get_profile(client):
    saved = client.put("/api/profile", json=_payload(), headers={"X-User-Id": "uid-1"})
    assert saved.status_code == 200
    body = saved.json()
    assert body["user_id"] == "uid-1"
    assert body["displayName"] == "Ada Lovelace"

    fetched = client.get("/api/profile", headers={"X-User-Id": "uid-1"})
    assert fetched.status_code == 200
    assert fetched.json() == body


def test_get_missing_profile_returns_404(client):
    assert client.get("/api/profile", headers={"X-User-Id": "ghost"}).status_code == 404


def test_profile_requires_user_id_header(client):
    assert client.put("/api/profile", json=_payload()).status_code == 400
    assert client.get("/api/profile").status_code == 400


def test_profile_rejects_invalid_body(client):
    bad = _payload(heightCm=9999.0)
    res = client.put("/api/profile", json=bad, headers={"X-User-Id": "uid-1"})
    assert res.status_code == 422


def test_profile_ignores_unknown_fields(client):
    res = client.put(
        "/api/profile",
        json={**_payload(), "malicious": "injected"},
        headers={"X-User-Id": "uid-1"},
    )
    assert res.status_code == 200
    assert "malicious" not in res.json()
