"""
app/services/skin_metrics.py
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
Pure-function CV metric calculations for all 18+ VitalScan skin conditions.

These are cosmetic image-quality estimates only — not medical diagnoses.

Usage
-----
    from app.services.skin_metrics import compute_all_conditions

    result = compute_all_conditions(img_bgr, landmarks, img_w, img_h)
    # → {"primary_skin_type": str, "conditions": {condition_name: float, ...}}

All scores are on a 0–10 severity scale (higher = more severe / more visible).
The caller (route handler) is responsible for converting these to the 0–100
consumer contract via build_metric().
"""
from __future__ import annotations

from typing import Any

import cv2
import numpy as np

from app.services.face_mesh import ZONES, get_zone_mask


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _safe_nonzero(mask: np.ndarray) -> int:
    """Return countNonZero, guarding against empty masks."""
    return max(1, cv2.countNonZero(mask))


def _laplacian_var(gray: np.ndarray, mask: np.ndarray) -> float:
    """Laplacian variance inside a masked region (texture / pore proxy)."""
    masked = cv2.bitwise_and(gray, gray, mask=mask)
    return float(cv2.Laplacian(masked, cv2.CV_64F).var())


def _mean_channel(channel: np.ndarray, mask: np.ndarray) -> float:
    """Mean pixel value of a single-channel image inside a mask."""
    return float(cv2.mean(channel, mask=mask)[0])


def _std_channel(channel: np.ndarray, mask: np.ndarray) -> float:
    """Standard deviation of a single-channel image inside a mask."""
    _, std = cv2.meanStdDev(channel, mask=mask)
    return float(std[0][0])


def _clamp_min_max(val: float, min_in: float = 0.0, max_in: float = 100.0) -> float:
    """
    Min-max normalizes a raw signal metric (e.g., Laplacian variance or HSV density)
    into a [0.0, 10.0] severity score with strict clamping to prevent raw noise
    from automatically hitting 10.0.
    """
    if val <= min_in:
        return 0.0
    if val >= max_in:
        return 10.0
    scaled = ((val - min_in) / (max_in - min_in)) * 10.0
    return round(float(np.clip(scaled, 0.0, 10.0)), 1)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

# Display names returned by compute_all_conditions -> model CONCERNS keys.
# glowScore and hydration are derived at the end of as_concern_scores().
CONDITION_TO_CONCERN: dict[str, str] = {
    "Acne & Breakouts":            "acneLevel",
    "Blackheads / Whiteheads":     "blackheads",
    "Oily / Shiny Skin":           "oiliness",
    "Dry / Flaky Skin":            "dryness",
    "Sensitive / Redness":         "redness",
    "Dark Circles":                "darkCircles",
    "Dark Spots / Pigmentation":   "pigmentation",
    "Melasma":                     "melasma",
    "Tanning / Sun Damage":        "tanning",
    "Enlarged Pores":              "poreVisibility",
    "Uneven Texture":              "texture",
    "Dullness / Lack of Radiance": "dullness",
    "Acne Scars / Marks":          "acneScars",
    "Ageing / Fine Lines":         "aging",
    "Under-eye Puffiness":         "puffiness",
    "Dehydration":                 "dehydration",
    "Milia":                       "milia",
    "Sunburn / Irritation":        "sunburn",
}


def as_concern_scores(conditions: dict) -> dict[str, float]:
    """Map compute_all_conditions output to the 20 model CONCERNS keys (0-10).

    glowScore and hydration are health metrics (higher = better) and are
    therefore inverted from their visual defect proxies (dullness, dryness).
    """
    scores = {concern: round(float(conditions[display]), 1)
              for display, concern in CONDITION_TO_CONCERN.items()}
    dullness = float(conditions["Dullness / Lack of Radiance"])
    dryness = float(conditions["Dry / Flaky Skin"])
    scores["glowScore"] = round(min(10.0, max(0.0, 10.0 - dullness)), 1)
    scores["hydration"] = round(min(10.0, max(0.0, 10.0 - dryness)), 1)
    return scores

def compute_all_conditions(
    img: np.ndarray,
    landmarks: list[Any],
    img_w: int,
    img_h: int,
) -> dict:
    """
    Compute all 18 skin condition scores using zone-masked CV signals.

    Parameters
    ----------
    img       : BGR image (already preprocessed / face-cropped)
    landmarks : MediaPipe face mesh landmark list for the primary face
    img_w     : Pixel width  of ``img``
    img_h     : Pixel height of ``img``

    Returns
    -------
    dict with keys:
      "primary_skin_type" : str
      "conditions"        : dict[str, float]   # 0-10 severity scores
    """
    # ------------------------------------------------------------------
    # Derive colour-space representations
    # ------------------------------------------------------------------
    img_gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    img_lab  = cv2.cvtColor(img, cv2.COLOR_BGR2LAB)
    img_hsv  = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)

    l_chan = img_lab[:, :, 0]
    a_chan = img_lab[:, :, 1]
    b_chan = img_lab[:, :, 2]

    # ------------------------------------------------------------------
    # Zone masks
    # ------------------------------------------------------------------
    mask_forehead   = get_zone_mask(img.shape, landmarks, ZONES["FOREHEAD"],    img_w, img_h)
    mask_left_cheek = get_zone_mask(img.shape, landmarks, ZONES["LEFT_CHEEK"],  img_w, img_h)
    mask_right_cheek= get_zone_mask(img.shape, landmarks, ZONES["RIGHT_CHEEK"], img_w, img_h)
    mask_nose       = get_zone_mask(img.shape, landmarks, ZONES["NOSE"],        img_w, img_h)
    mask_eyes       = get_zone_mask(img.shape, landmarks, ZONES["UNDER_EYES"],  img_w, img_h)
    mask_crow_feet  = get_zone_mask(img.shape, landmarks, ZONES["CROW_FEET"],   img_w, img_h)
    mask_eye_bags   = get_zone_mask(img.shape, landmarks, ZONES["EYE_BAGS"],    img_w, img_h)

    mask_cheeks = cv2.bitwise_or(mask_left_cheek, mask_right_cheek)
    mask_face   = cv2.bitwise_or(mask_cheeks, mask_forehead)

    # ------------------------------------------------------------------
    # 1. Acne & Breakouts  — HSV red-pixel density on face zone
    # ------------------------------------------------------------------
    red1      = cv2.inRange(img_hsv, (0,   60, 60), (10,  255, 255))
    red2      = cv2.inRange(img_hsv, (170, 60, 60), (180, 255, 255))
    red_mask  = cv2.bitwise_or(red1, red2)
    acne_mask = cv2.bitwise_and(red_mask, mask_face)
    acne_density = (cv2.countNonZero(acne_mask) / _safe_nonzero(mask_face)) * 100.0
    acne_score = _clamp_min_max(acne_density, 0.0, 6.0)

    # ------------------------------------------------------------------
    # 2. Blackheads / Whiteheads  — Laplacian variance on nose T-zone
    # ------------------------------------------------------------------
    lap_var_nose = _laplacian_var(img_gray, mask_nose)
    blackheads_score = _clamp_min_max(lap_var_nose, 20.0, 450.0)

    # ------------------------------------------------------------------
    # 3. Oily / Shiny Skin  — bright-highlight ratio on forehead
    # ------------------------------------------------------------------
    forehead_pixels = img_gray[mask_forehead > 0]
    glare_ratio = (
        float(np.sum(forehead_pixels > 215) / max(1, len(forehead_pixels)))
        if len(forehead_pixels) > 0 else 0.0
    )
    oily_score = _clamp_min_max(glare_ratio * 100.0, 0.0, 10.0)

    # ------------------------------------------------------------------
    # 4. Dry / Flaky Skin  — inverse of oiliness with floor
    # ------------------------------------------------------------------
    dry_score = round(max(0.5, min(10.0, 8.5 - oily_score)), 1)

    # ------------------------------------------------------------------
    # 5. Combination Skin  — derived label, returned as a score flag
    # ------------------------------------------------------------------
    if oily_score > 5.0 and dry_score > 4.0:
        primary_skin_type = "Combination Skin"
        combination_score = 7.5
    elif oily_score > 5.0:
        primary_skin_type = "Oily Skin"
        combination_score = 2.0
    else:
        primary_skin_type = "Dry / Normal Skin"
        combination_score = 2.0

    # ------------------------------------------------------------------
    # 6. Sensitive / Redness  — cheek a* (red-green) channel elevation
    # ------------------------------------------------------------------
    redness_val     = _mean_channel(a_chan, mask_cheeks)
    sensitive_score = _clamp_min_max(max(0.0, redness_val - 128.0), 0.0, 25.0)

    # ------------------------------------------------------------------
    # 7. Dark Circles  — L* difference between cheek and under-eye zones
    # ------------------------------------------------------------------
    eye_lum          = _mean_channel(l_chan, mask_eyes)
    cheek_lum        = _mean_channel(l_chan, mask_cheeks)
    dark_circles_score = _clamp_min_max(max(0.0, cheek_lum - eye_lum), 0.0, 22.0)

    # ------------------------------------------------------------------
    # 8 & 9. Dark Spots / Pigmentation + Melasma
    #         Standard deviation of a* and b* channels across cheeks
    # ------------------------------------------------------------------
    std_a = _std_channel(a_chan, mask_cheeks)
    std_b = _std_channel(b_chan, mask_cheeks)
    pigmentation_score = _clamp_min_max(std_a + std_b, 4.0, 28.0)
    melasma_score      = round(max(0.0, min(10.0, pigmentation_score * 0.75)), 1)

    # ------------------------------------------------------------------
    # 10. Tanning / Sun Damage  — overall L* depression across face zone
    # ------------------------------------------------------------------
    overall_l    = _mean_channel(l_chan, mask_face)
    tanning_score = _clamp_min_max(max(0.0, 160.0 - overall_l), 0.0, 60.0)

    # ------------------------------------------------------------------
    # 11 & 12. Enlarged Pores + Uneven Texture  — Laplacian variance on cheeks
    # ------------------------------------------------------------------
    lap_var_cheeks = _laplacian_var(img_gray, mask_cheeks)
    pores_score   = _clamp_min_max(lap_var_cheeks, 25.0, 500.0)
    texture_score = pores_score   # same CV signal, reported separately

    # ------------------------------------------------------------------
    # 13. Dullness / Lack of Radiance  — low cheek luminance
    # ------------------------------------------------------------------
    dullness_score = _clamp_min_max(max(0.0, 170.0 - cheek_lum), 0.0, 80.0)

    # ------------------------------------------------------------------
    # 14. Acne Scars / Marks  — proportional proxy from acne score
    # ------------------------------------------------------------------
    scars_score = round(max(0.0, min(10.0, acne_score * 0.8)), 1)

    # ------------------------------------------------------------------
    # 15. Ageing / Fine Lines  — Canny edge density in crow's feet zone
    # ------------------------------------------------------------------
    edges = cv2.bitwise_and(cv2.Canny(img_gray, 50, 150), mask_crow_feet)
    edge_density = (cv2.countNonZero(edges) / _safe_nonzero(mask_crow_feet)) * 100.0
    fine_lines_score = _clamp_min_max(edge_density, 0.0, 15.0)

    # ------------------------------------------------------------------
    # 16. Under-eye Puffiness  — vertical Sobel gradient variance,
    #     measured INSIDE the under-eye bag region only (a whole-image
    #     Sobel statistic would also respond to unrelated facial texture).
    # ------------------------------------------------------------------
    sobel = cv2.Sobel(img_gray, cv2.CV_64F, 0, 1, ksize=3)
    bag_pixels = sobel[mask_eye_bags > 0]
    sobel_var = float(bag_pixels.var()) if bag_pixels.size > 0 else 0.0
    puffiness_score = _clamp_min_max(sobel_var, 30.0, 600.0)

    # ------------------------------------------------------------------
    # 17. Dehydration  — slightly amplified dryness signal
    # ------------------------------------------------------------------
    dehydration_score = round(max(0.5, min(10.0, dry_score * 1.1)), 1)

    # ------------------------------------------------------------------
    # 18. Milia  — fine cyst proxy from pore visibility
    # ------------------------------------------------------------------
    milia_score = round(max(0.0, min(10.0, pores_score * 0.4)), 1)

    # ------------------------------------------------------------------
    # 19. Sunburn / Irritation  — amplified redness
    # ------------------------------------------------------------------
    sunburn_score = round(max(0.0, min(10.0, sensitive_score * 1.2)), 1)

    return {
        "primary_skin_type": primary_skin_type,
        "conditions": {
            "Acne & Breakouts":           acne_score,
            "Blackheads / Whiteheads":    blackheads_score,
            "Oily / Shiny Skin":          oily_score,
            "Dry / Flaky Skin":           dry_score,
            "Combination Skin":           combination_score,
            "Sensitive / Redness":        sensitive_score,
            "Dark Circles":               dark_circles_score,
            "Dark Spots / Pigmentation":  pigmentation_score,
            "Melasma":                    melasma_score,
            "Tanning / Sun Damage":       tanning_score,
            "Enlarged Pores":             pores_score,
            "Uneven Texture":             texture_score,
            "Dullness / Lack of Radiance":dullness_score,
            "Acne Scars / Marks":         scars_score,
            "Ageing / Fine Lines":        fine_lines_score,
            "Under-eye Puffiness":        puffiness_score,
            "Dehydration":                dehydration_score,
            "Milia":                      milia_score,
            "Sunburn / Irritation":       sunburn_score,
        },
    }
