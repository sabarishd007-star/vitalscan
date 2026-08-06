"""
tests/test_metrics.py
~~~~~~~~~~~~~~~~~~~~~~
Golden-image regression tests for the CV metric pipeline.

These tests use synthetic BGR images and a synthetic MediaPipe landmark set so
that ``compute_all_conditions`` is exercised without real photos. They pin
determinism and basic sensitivity:

  - identical input -> identical output
  - all scores within the 0-10 severity scale
  - red-spotted faces score higher on Acne / Redness than a plain face
  - a darkened under-eye band scores higher on Dark Circles

Run from ml-backend/ with:  python -m pytest
"""
import numpy as np
import pytest

from app.services.skin_metrics import compute_all_conditions

W, H = 640, 480

# Skin tone (BGR): warm, mid-tone face colour
SKIN = (120, 150, 200)
# Blemish colour (BGR): strongly red
RED = (30, 40, 220)
# Under-eye shadow colour (BGR): much darker than skin
SHADOW = (60, 80, 110)


def _landmark(x, y):
    class _L:
        pass

    lm = _L()
    lm.x = float(x)
    lm.y = float(y)
    lm.z = 0.0
    return lm


def build_face_mesh():
    """
    Synthetic 468-point mesh. Points for the zone indices are spread over the
    corresponding facial region; all other indices sit at the face centre and
    are never referenced by a zone.
    """
    lm = [_landmark(0.5, 0.5) for _ in range(468)]

    def assign(indices, cx, cy, sx, sy):
        n = max(1, len(indices))
        for i, idx in enumerate(indices):
            a = (i / n) * 2 * np.pi
            lm[idx] = _landmark(cx + sx * np.cos(a), cy + sy * np.sin(a))

    assign([10, 338, 297, 332, 284, 251, 21, 54, 103, 67, 109], 0.50, 0.22, 0.12, 0.05)
    assign([6, 197, 195, 5, 4, 1, 19, 94, 2], 0.50, 0.40, 0.06, 0.08)
    assign([33, 7, 163, 144, 145, 153, 154, 155, 133,
            362, 382, 381, 380, 374, 373, 390, 249, 263], 0.50, 0.44, 0.14, 0.03)
    assign([117, 118, 101, 205, 207, 214, 129, 203], 0.30, 0.60, 0.06, 0.05)
    assign([346, 347, 348, 425, 427, 434, 358, 423], 0.70, 0.60, 0.06, 0.05)
    assign([98, 327], 0.50, 0.48, 0.02, 0.02)
    assign([130, 246, 161, 160, 159, 158, 157, 173,
            359, 466, 388, 387, 386, 385, 384, 398], 0.50, 0.42, 0.24, 0.05)
    assign([226, 247, 30, 29, 27, 28, 56, 190,
            243, 463, 414, 286, 258, 257, 259, 260, 467], 0.50, 0.52, 0.18, 0.06)
    return lm


LANDMARKS = build_face_mesh()


def base_image():
    img = np.zeros((H, W, 3), dtype=np.uint8)
    img[:, :] = SKIN
    return img


def acne_image():
    img = base_image()
    rng = np.random.default_rng(42)
    regions = [
        (W * 0.38, W * 0.62, H * 0.16, H * 0.28),  # forehead
        (W * 0.26, W * 0.34, H * 0.55, H * 0.65),  # left cheek
        (W * 0.66, W * 0.74, H * 0.55, H * 0.65),  # right cheek
    ]
    for (x0, x1, y0, y1) in regions:
        for _ in range(300):
            x = int(rng.integers(x0, x1))
            y = int(rng.integers(y0, y1))
            img[y : y + 6, x : x + 6] = RED
    return img


def shadow_image():
    img = base_image()
    img[int(H * 0.42) : int(H * 0.47), int(W * 0.34) : int(W * 0.66)] = SHADOW
    return img


def analyze(img):
    return compute_all_conditions(img, LANDMARKS, W, H)


def conds(result):
    return result["conditions"]


# ---------------------------------------------------------------------------
# Golden behaviour
# ---------------------------------------------------------------------------


def test_deterministic_output():
    assert analyze(base_image()) == analyze(base_image())


def test_all_scores_in_scale():
    result = analyze(base_image())
    for name, score in conds(result).items():
        assert 0.0 <= score <= 10.0, f"{name} out of range: {score}"
    assert result["primary_skin_type"] in {"Oily Skin", "Dry / Normal Skin", "Combination Skin"}


def test_skin_type_is_stable():
    assert analyze(base_image())["primary_skin_type"] == analyze(base_image())["primary_skin_type"]


def test_golden_snapshot_uniform_face():
    """
    Golden regression pin. If this dict changes, a behaviour change was
    introduced intentionally; update the pin in the same commit.
    """
    expected = {
        "Acne & Breakouts": 0.0,
        "Blackheads / Whiteheads": 3.6,
        "Oily / Shiny Skin": 0.0,
        "Dry / Flaky Skin": 8.5,
        "Combination Skin": 2.0,
        "Sensitive / Redness": 6.0,
        "Dark Circles": 0.0,
        "Dark Spots / Pigmentation": 0.0,
        "Melasma": 0.0,
        "Tanning / Sun Damage": 0.0,
        "Enlarged Pores": 6.9,
        "Uneven Texture": 6.9,
        "Dullness / Lack of Radiance": 0.1,
        "Acne Scars / Marks": 0.0,
        "Ageing / Fine Lines": 0.0,
        "Under-eye Puffiness": 0.0,
        "Dehydration": 9.4,
        "Milia": 2.8,
        "Sunburn / Irritation": 7.2,
    }
    result = analyze(base_image())
    assert result["primary_skin_type"] == "Dry / Normal Skin"
    assert conds(result) == expected


# ---------------------------------------------------------------------------
# Sensitivity
# ---------------------------------------------------------------------------


def test_acne_red_detection():
    plain = conds(analyze(base_image()))
    red = conds(analyze(acne_image()))
    assert red["Acne & Breakouts"] > plain["Acne & Breakouts"]


def test_redness_sensitivity():
    plain = conds(analyze(base_image()))
    red = conds(analyze(acne_image()))
    assert red["Sensitive / Redness"] >= plain["Sensitive / Redness"]


def test_dark_circles_sensitivity():
    plain = conds(analyze(base_image()))
    shadowed = conds(analyze(shadow_image()))
    assert shadowed["Dark Circles"] > plain["Dark Circles"]
