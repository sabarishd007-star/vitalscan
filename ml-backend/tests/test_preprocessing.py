"""
tests/test_preprocessing.py
~~~~~~~~~~~~~~~~~~~~~~~~~~~
Golden-image regression tests for the preprocessing pipeline
(``app/services/preprocessing.py``).

The pipeline (decode -> face crop -> CLAHE LAB -> bilateral filter) is exercised
with a deterministic synthetic image that contains no detectable face, so it
follows the centre-crop path deterministically and fast.

  - identical bytes -> identical output (determinism)
  - output is BGR uint8 and smaller than the input (a crop happened)
  - golden snapshot pins the exact output statistics so an accidental change
    to the pipeline (filter order, CLAHE clip limit, crop fraction, ...) fails
    loudly and must be approved in the same commit
  - invalid bytes raise ValueError
  - equalize_lighting smooths large-scale illumination gradients (CLAHE) while
    leaving a flat image untouched

Run from ml-backend/ with:  python -m pytest tests/test_preprocessing.py
"""
import numpy as np
import pytest

from app.services.preprocessing import equalize_lighting, preprocess_skin_image


def _synthetic_bytes() -> bytes:
    """A 400x300 BGR image with a vertical illumination gradient plus a couple
    of small textured patches (no face-like features -> centre-crop path)."""
    h, w = 300, 400
    import cv2

    y = np.linspace(60, 200, h, dtype=np.uint8).reshape(-1, 1)
    img = np.repeat(y, w, axis=1)
    img = np.stack([img, img, img], axis=-1)
    img[100:125, 150:175] = (30, 40, 220)
    img[200:230, 250:300] = (60, 60, 60)
    ok, buf = cv2.imencode(".jpg", img)
    assert ok
    return buf.tobytes()


def test_preprocess_returns_bgr_uint8_crop():
    out = preprocess_skin_image(_synthetic_bytes())
    assert out.dtype == np.uint8
    assert out.ndim == 3
    assert out.shape[2] == 3
    # 400x300 centre-cropped 80% -> (240, 320, 3); a crop happened.
    assert out.shape[:2] == (240, 320)


def test_preprocess_is_deterministic():
    a = preprocess_skin_image(_synthetic_bytes())
    b = preprocess_skin_image(_synthetic_bytes())
    assert np.array_equal(a, b)


def test_golden_snapshot_center_crop():
    """
    Golden regression pin for the preprocessed centre-crop output. If this
    changes, the pipeline changed behaviour intentionally (filter order, CLAHE
    clip limit, crop fraction, ...); update the pin in the same commit.
    """
    out = preprocess_skin_image(_synthetic_bytes())
    means = out.reshape(-1, 3).mean(axis=0)
    stds = out.reshape(-1, 3).std(axis=0)
    expected_means = [127.81, 127.95, 129.4]
    expected_stds = [33.11, 32.9, 33.23]
    assert [round(float(x), 2) for x in means] == expected_means
    assert [round(float(x), 2) for x in stds] == expected_stds
    assert out.min() == 33
    assert out.max() == 238


def test_preprocess_rejects_invalid_bytes():
    with pytest.raises(ValueError):
        preprocess_skin_image(b"definitely not an image")


def test_equalize_lighting_reduces_gradient_contrast():
    import cv2

    y = np.linspace(60, 200, 300, dtype=np.uint8).reshape(-1, 1)
    img = np.repeat(y, 400, axis=1)
    img = np.stack([img, img, img], axis=-1)
    lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB)
    in_std = float(lab[:, :, 0].std())
    out = equalize_lighting(img)
    lab_out = cv2.cvtColor(out, cv2.COLOR_BGR2LAB)
    out_std = float(lab_out[:, :, 0].std())
    assert out_std < in_std, "CLAHE should flatten the large-scale gradient"


def test_equalize_lighting_flat_image_stays_flat():
    flat = np.full((100, 100, 3), 128, np.uint8)
    out = equalize_lighting(flat)
    assert len(np.unique(out)) == 1
