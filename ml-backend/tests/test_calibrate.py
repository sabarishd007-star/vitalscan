"""Tests for calibrate.py Platt-scaling fitter and model integration."""
import json
import os

import numpy as np
from PIL import Image

from calibrate import fit_calibration, fit_platt
from model import CONCERNS, SkinModelLoader

from test_eval import WEIGHTS, load_entries, make_dataset


def binary_ce(transformed_logits, y):
    p = 1.0 / (1.0 + np.exp(-np.asarray(transformed_logits, dtype=float)))
    p = np.clip(p, 1e-9, 1.0 - 1e-9)
    return float(-np.mean(y * np.log(p) + (1.0 - y) * np.log(1.0 - p)))


def test_fit_platt_improves_loss_on_linear_separable_data():
    rng = np.random.default_rng(0)
    y = (rng.random(300) > 0.5).astype(float)
    z = 1.5 * (y - 0.5) * 2.0 + rng.normal(0.0, 0.4, 300)
    before = binary_ce(z, y)
    params = fit_platt(z, y)
    after = binary_ce(params["a"] * z + params["b"], y)
    assert after < before
    assert params["a"] > 0.0
    assert np.isfinite(params["a"]) and np.isfinite(params["b"])


def test_fit_platt_returns_identity_when_single_class():
    params = fit_platt(np.array([0.1, 0.2, 0.3]), np.array([1.0, 1.0, 1.0]))
    assert params == {"a": 1.0, "b": 0.0}


def test_calibration_roundtrip(tmp_path):
    make_dataset(str(tmp_path))
    calibration = fit_calibration(load_entries(tmp_path), WEIGHTS)
    assert calibration["fit_on"] == 12
    assert set(calibration["conditions"]) == set(CONCERNS)
    for c in CONCERNS:
        assert np.isfinite(calibration["conditions"][c]["a"])
        assert np.isfinite(calibration["conditions"][c]["b"])

    cal_path = os.path.join(str(tmp_path), "calibration.json")
    with open(cal_path, "w", encoding="utf-8") as fh:
        json.dump(calibration, fh, indent=2)

    loader = SkinModelLoader(WEIGHTS, calibration_path=cal_path)
    assert loader.calibration is not None
    image = Image.new("RGB", (64, 64), (150, 120, 100))
    probs = loader.predict_probabilities(image)
    assert probs.shape == (len(CONCERNS),)
    assert np.all((probs >= 0.0) & (probs <= 1.0))

    response = loader.predict(image, {"waterIntake": 2.5, "sleepHours": 7, "stressLevel": 4})
    for c in CONCERNS:
        assert 0.0 <= response[c] <= 10.0
    assert 50 <= response["analysisConfidence"] <= 95


def test_missing_calibration_file_is_ignored():
    loader = SkinModelLoader(WEIGHTS, calibration_path="does-not-exist.json")
    assert loader.calibration is None
