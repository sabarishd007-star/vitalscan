"""Tests for the eval.py harness (AUROC/MAE computation, gating logic)."""
import csv
import os

import numpy as np
import pytest
from PIL import Image

from eval import (
    PRESENT_AT,
    auroc,
    collect_predictions,
    compute_metrics,
    evaluate_by_tone,
    load_thresholds,
    passes_thresholds,
)
from model import CONCERNS, SkinModelLoader

WEIGHTS = os.path.join(os.path.dirname(__file__), "..", "weights", "skin_model.pth")


def make_dataset(root, n=12, seed=7):
    """Synthetic labeled dataset: alternating light/dark tones, some red patches."""
    images_dir = os.path.join(root, "images")
    os.makedirs(images_dir, exist_ok=True)
    rng = np.random.default_rng(seed)
    rows = []
    for i in range(n):
        tone = 120 + (i % 5) * 25
        arr = np.full((64, 64, 3), (tone, tone // 2, tone // 3), dtype=np.uint8)
        if i % 2 == 0:
            arr[12:32, 12:32] = (50, 50, 230)
        filename = f"img_{i:03d}.jpg"
        Image.fromarray(arr).save(os.path.join(images_dir, filename))
        row = {"filename": filename, "skin_tone": str(i % 6 + 1)}
        for c in CONCERNS:
            row[c] = "0.7" if i % 3 == 0 else "0.1"
        rows.append(row)
    csv_path = os.path.join(root, "labels.csv")
    with open(csv_path, "w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=["filename"] + CONCERNS + ["skin_tone"])
        writer.writeheader()
        writer.writerows(rows)
    return rows


def test_auroc_perfect_separation():
    labels = np.array([0, 0, 0, 1, 1, 1])
    scores = np.array([0.1, 0.2, 0.3, 0.8, 0.9, 0.95])
    assert auroc(labels, scores) == pytest.approx(1.0)


def test_auroc_reversed():
    labels = np.array([0, 0, 0, 1, 1, 1])
    scores = np.array([0.95, 0.9, 0.8, 0.3, 0.2, 0.1])
    assert auroc(labels, scores) == pytest.approx(0.0)


def test_auroc_ties_use_average_ranks():
    labels = np.array([0, 0, 1, 1])
    scores = np.array([0.5, 0.5, 0.5, 0.5])
    assert auroc(labels, scores) == pytest.approx(0.5)


def test_auroc_single_class_is_none():
    assert auroc(np.zeros(4, dtype=bool), np.array([0.1, 0.2, 0.3, 0.4])) is None


def test_evaluate_returns_metrics_for_all_concerns(tmp_path):
    make_dataset(str(tmp_path))
    loader = SkinModelLoader(WEIGHTS)
    preds, truths, tones = collect_predictions(loader, load_entries(tmp_path))
    metrics = compute_metrics(preds, truths)

    for concern in CONCERNS:
        assert "mae" in metrics["conditions"][concern]
        assert "auc" in metrics["conditions"][concern]
        assert metrics["conditions"][concern]["mae"] >= 0.0
    assert metrics["overall"]["mean_mae"] >= 0.0
    assert metrics["overall"]["mean_auc"] is None or 0.0 <= metrics["overall"]["mean_auc"] <= 1.0
    assert len(tones) == 12


def test_predictions_are_deterministic(tmp_path):
    make_dataset(str(tmp_path))
    loader = SkinModelLoader(WEIGHTS)
    entries = load_entries(tmp_path)
    preds_a, _, _ = collect_predictions(loader, entries)
    preds_b, _, _ = collect_predictions(loader, entries)
    for concern in CONCERNS:
        assert preds_a[concern] == preds_b[concern]


def test_by_tone_breakdown(tmp_path):
    make_dataset(str(tmp_path))
    loader = SkinModelLoader(WEIGHTS)
    breakdown = evaluate_by_tone(loader, load_entries(tmp_path))
    assert set(breakdown) == {"1", "2", "3", "4", "5", "6"}
    for tone, m in breakdown.items():
        assert "overall" in m and "conditions" in m


def test_passes_thresholds_detects_failures():
    metrics = {
        "conditions": {
            "acneLevel": {"mae": 1.2, "auc": 0.8},
            "dryness": {"mae": 2.5, "auc": 0.6},
        }
    }
    thresholds = {
        "conditions": {
            "acneLevel": {"max_mae": 1.5, "min_auc": 0.75},
            "dryness": {"max_mae": 2.0, "min_auc": 0.7},
        }
    }
    ok, report = passes_thresholds(metrics, thresholds)
    assert ok is False
    statuses = {r["condition"]: r["status"] for r in report}
    assert statuses["acneLevel"] == "PASS"
    assert statuses["dryness"] == "FAIL"
    dryness = next(r for r in report if r["condition"] == "dryness")
    assert dryness["reasons"]


def test_load_thresholds_roundtrip(tmp_path):
    path = os.path.join(str(tmp_path), "th.json")
    with open(path, "w", encoding="utf-8") as fh:
        fh.write('{"conditions": {"acneLevel": {"max_mae": 1.5}}}')
    data = load_thresholds(path)
    assert data["conditions"]["acneLevel"]["max_mae"] == 1.5


def load_entries(root):
    from dataset import load_dataset

    return load_dataset(str(root))
