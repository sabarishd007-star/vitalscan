"""
tests/test_model.py
~~~~~~~~~~~~~~~~~~~
Golden-image regression tests for the distilled MobileNetV2 model
(``app/services/../model.py``).

These pin the behaviour of the committed ``weights/skin_model.pth``:

  - CONCERNS contract: 20 unique internal keys
  - raw logits are deterministic for a fixed input image
  - the golden logits snapshot pins the committed weights, so an accidental
    retrain / weight swap / architecture change fails loudly
  - the full ``predict`` contract exposes every concern plus bounded
    analysisConfidence / overallScore and reacts to lifestyle parameters

Run from ml-backend/ with:  python -m pytest tests/test_model.py
"""
import os

import numpy as np
import pytest
from PIL import Image

from model import CONCERNS, SkinModelLoader

WEIGHTS = os.path.join(os.path.dirname(__file__), "..", "weights", "skin_model.pth")

# Fixed synthetic input used by every model test (skin tone + red patch +
# darker cheek patch). 128x128 keeps inference fast.
def _synthetic_pil() -> Image.Image:
    img = np.full((128, 128, 3), (200, 150, 120), dtype=np.uint8)
    img[40:60, 50:80] = (40, 40, 230)
    img[80:100, 20:50] = (90, 90, 90)
    return Image.fromarray(img)


DEFAULT_PARAMS = {
    "age": 30,
    "sleepHours": 7.0,
    "waterIntake": 2.5,
    "stressLevel": 4,
    "skinConcern": "none",
}

# Golden logits for the synthetic image above with the committed weights
# (uncalibrated, raw model outputs in CONCERNS order). If these change, the
# weights file changed; update the pin in the same commit as the weight swap.
GOLDEN_LOGITS = [
    -0.084, -1.322, -0.2227, -0.4053, 0.638, 2.2799, 0.9921, 2.54,
    -1.3708, -0.0827, 2.0951, 0.2901, 0.9899, 1.1611, -0.4892,
    -0.2314, 1.4087, -0.0383, -0.5938, 0.7354,
]


@pytest.fixture(scope="module")
def loader():
    return SkinModelLoader(WEIGHTS)


def test_concerns_contract():
    assert len(CONCERNS) == 20
    assert len(set(CONCERNS)) == 20


def test_logits_are_deterministic(loader):
    a = loader.predict_logits(_synthetic_pil())
    b = loader.predict_logits(_synthetic_pil())
    assert np.array_equal(a, b)


def test_golden_logits_snapshot(loader):
    """
    Golden regression pin for the committed weights. If these logits change,
    the weights were changed intentionally; update the pin in the same commit.
    """
    logits = loader.predict_logits(_synthetic_pil())
    assert [round(float(x), 4) for x in logits] == GOLDEN_LOGITS


def test_predict_returns_full_contract(loader):
    result = loader.predict(_synthetic_pil(), dict(DEFAULT_PARAMS))
    for concern in CONCERNS:
        assert concern in result
        assert 0.0 <= result[concern] <= 10.0
    assert 50 <= result["analysisConfidence"] <= 95
    assert 1.0 <= result["overallScore"] <= 10.0
    assert result["skinType"] in {"Normal", "Oily", "Dry", "Combination", "Sensitive"}
    assert isinstance(result["detectedConcerns"], list)


def test_lifestyle_adjustments_affect_hydration(loader):
    low_water = loader.predict(_synthetic_pil(), {**DEFAULT_PARAMS, "waterIntake": 0.5})
    high_water = loader.predict(_synthetic_pil(), {**DEFAULT_PARAMS, "waterIntake": 3.0})
    assert low_water["hydration"] < high_water["hydration"]
    assert low_water["dehydration"] > high_water["dehydration"]
