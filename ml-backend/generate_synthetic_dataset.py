"""
ml-backend/generate_synthetic_dataset.py
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
Generate a fully synthetic face-image training corpus whose labels are
produced by the SAME CV heuristics the production pipeline uses
(``app.services.skin_metrics.compute_all_conditions``).

This is a *distillation* dataset: training on it teaches the neural model to
replicate the deterministic skin-metrics heuristics, so that the shipped
``skin_model.pth`` and the live CV path agree.  It is NOT dermatological
ground truth — the labels are only as trustworthy as the heuristics themselves.

Pipeline
--------
1. Build a 468-point landmark template arranged over a fixed face layout
   (forehead / cheeks / nose / under-eye / crow's-feet / eye-bag zones).
2. Render a synthetic face: warm-skin ellipse on a dark background.
3. Apply randomised perturbations (acne spots, redness patches, oil glare,
   dark circles, tanning, texture noise, pigment speckles, fine lines, ...).
4. Feed the result + template landmarks to ``compute_all_conditions`` and write
   the resulting 0-10 scores as ``labels.csv`` values normalised to 0-1.

Usage
-----
    python generate_synthetic_dataset.py --count 400 --output-dir dist_dataset
    python generate_synthetic_dataset.py --probe 40      # print label spread only
"""
from __future__ import annotations

import argparse
import csv
import os
from types import SimpleNamespace

import cv2
import numpy as np

from app.services.face_mesh import ZONES, get_zone_mask
from app.services.skin_metrics import compute_all_conditions
from model import CONCERNS


# ---------------------------------------------------------------------------
# Zone rectangles (normalised 0-1 coordinates) — one rect per template region
# ---------------------------------------------------------------------------
RECTS: dict[str, tuple[float, float, float, float]] = {
    "FOREHEAD":   (0.40, 0.16, 0.60, 0.30),
    "LEFT_CHEEK": (0.30, 0.42, 0.44, 0.60),
    "RIGHT_CHEEK":(0.56, 0.42, 0.70, 0.60),
    "NOSE":       (0.45, 0.36, 0.55, 0.52),
    "UNDER_EYES_L": (0.34, 0.33, 0.46, 0.41),
    "UNDER_EYES_R": (0.54, 0.33, 0.66, 0.41),
    "CROW_FEET_L":  (0.22, 0.34, 0.33, 0.44),
    "CROW_FEET_R":  (0.67, 0.34, 0.78, 0.44),
    "EYE_BAGS_L":   (0.35, 0.39, 0.47, 0.47),
    "EYE_BAGS_R":   (0.53, 0.39, 0.65, 0.47),
}

# Shared anchor indices (belong to multiple zones) placed LAST so their
# explicit location wins over the generic zone placement.
SHARED_ANCHORS: dict[int, tuple[float, float]] = {
    33:  (0.36, 0.34),
    263: (0.64, 0.34),
    130: (0.32, 0.40),
    98:  (0.44, 0.44),
    327: (0.56, 0.44),
}


def _lm(x: float, y: float) -> SimpleNamespace:
    return SimpleNamespace(x=float(x), y=float(y))


def _rect_points(x0: float, y0: float, x1: float, y1: float, count: int):
    """Evenly spaced points around a rectangle perimeter."""
    pts = []
    for k in range(count):
        t = k / max(1, count)
        if t < 0.25:
            u = t / 0.25
            pts.append((x0 + (x1 - x0) * u, y0))
        elif t < 0.5:
            u = (t - 0.25) / 0.25
            pts.append((x1, y0 + (y1 - y0) * u))
        elif t < 0.75:
            u = (t - 0.5) / 0.25
            pts.append((x1 - (x1 - x0) * u, y1))
        else:
            u = (t - 0.75) / 0.25
            pts.append((x0, y1 - (y1 - y0) * u))
    return pts


def build_template_landmarks() -> list[SimpleNamespace]:
    """Return a 468-point landmark list laid out over the zone rectangles."""
    landmarks = [_lm(0.5, 0.5) for _ in range(468)]

    def place(indices: list[int], rect_key: str) -> None:
        pts = _rect_points(*RECTS[rect_key], len(indices))
        for idx, (x, y) in zip(indices, pts):
            if idx < len(landmarks):
                landmarks[idx] = _lm(x, y)

    place(ZONES["FOREHEAD"], "FOREHEAD")
    place(ZONES["LEFT_CHEEK"], "LEFT_CHEEK")
    place(ZONES["RIGHT_CHEEK"], "RIGHT_CHEEK")
    place(ZONES["NOSE"], "NOSE")

    def place_side(indices: list[int], left_key: str, right_key: str) -> None:
        half = len(indices) // 2
        left, right = indices[:half], indices[half:]
        lpts = _rect_points(*RECTS[left_key], len(left))
        rpts = _rect_points(*RECTS[right_key], len(right))
        for idx, (x, y) in zip(left, lpts):
            landmarks[idx] = _lm(x, y)
        for idx, (x, y) in zip(right, rpts):
            landmarks[idx] = _lm(x, y)

    place_side(ZONES["UNDER_EYES"], "UNDER_EYES_L", "UNDER_EYES_R")
    place_side(ZONES["CROW_FEET"], "CROW_FEET_L", "CROW_FEET_R")
    place_side(ZONES["EYE_BAGS"], "EYE_BAGS_L", "EYE_BAGS_R")

    for idx, (x, y) in SHARED_ANCHORS.items():
        landmarks[idx] = _lm(x, y)

    return landmarks


TEMPLATE_LANDMARKS = build_template_landmarks()


# ---------------------------------------------------------------------------
# Image rendering
# ---------------------------------------------------------------------------

def _rect_mask(size: int, key: str) -> np.ndarray:
    mask = np.zeros((size, size), dtype=np.uint8)
    x0, y0, x1, y1 = RECTS[key]
    cv2.rectangle(mask, (int(x0 * size), int(y0 * size)),
                  (int(x1 * size), int(y1 * size)), 255, -1)
    return mask


def _face_mask(size: int) -> np.ndarray:
    mask = np.zeros((size, size), dtype=np.uint8)
    cv2.ellipse(mask, (size // 2, size // 2), (int(size * 0.30), int(size * 0.44)),
                0, 0, 360, 255, -1)
    return mask


def make_base_face(size: int, rng: np.random.Generator) -> tuple[np.ndarray, float]:
    """Render a synthetic face; returns (BGR image, base skin lightness L).

    The face/background boundary is feathered (soft alpha edge) so that the
    Sobel-variance puffiness heuristic responds to under-eye blobs rather than
    to the hard ellipse silhouette.
    """
    lightness = float(rng.uniform(135.0, 205.0))
    r = int(np.clip(lightness * 1.06, 0, 255))
    g = int(np.clip(lightness * 0.94, 0, 255))
    b = int(np.clip(lightness * 0.82, 0, 255))

    bg = np.full((size, size, 3), (42, 40, 46), dtype=np.float32)
    face_color = np.stack([np.full((size, size), r, dtype=np.float32),
                           np.full((size, size), g, dtype=np.float32),
                           np.full((size, size), b, dtype=np.float32)], axis=-1)

    mask = np.zeros((size, size), dtype=np.float32)
    cv2.ellipse(mask, (size // 2, size // 2),
                (int(size * 0.30), int(size * 0.44)), 0, 0, 360, 1.0, -1)
    mask = cv2.GaussianBlur(mask, (0, 0), sigmaX=6.0)

    img = bg * (1.0 - mask[..., None]) + face_color * mask[..., None]

    noise = rng.normal(0, 1.8, img.shape)
    img = np.clip(img + noise, 0, 255).astype(np.uint8)
    return img, lightness


def _random_point_in(mask: np.ndarray, rng: np.random.Generator) -> tuple[int, int]:
    ys, xs = np.where(mask > 0)
    pick = rng.integers(0, len(ys))
    return int(xs[pick]), int(ys[pick])


CONDITION_KEYS = [
    "acne", "redness", "oiliness", "dark_circles", "tanning", "dullness",
    "pores", "pigmentation", "blackheads", "aging", "puffiness",
]


def paint_perturbations(
    img: np.ndarray,
    size: int,
    tvals: dict[str, float],
    rng: np.random.Generator,
) -> np.ndarray:
    """Apply severity-scaled perturbations (t in [0, 10] per condition)."""
    face = _face_mask(size)
    cheeks = cv2.bitwise_or(_rect_mask(size, "LEFT_CHEEK"), _rect_mask(size, "RIGHT_CHEEK"))
    forehead = _rect_mask(size, "FOREHEAD")
    nose = _rect_mask(size, "NOSE")
    eye_band = _rect_mask(size, "UNDER_EYES_L") | _rect_mask(size, "UNDER_EYES_R")
    crow_band = _rect_mask(size, "CROW_FEET_L") | _rect_mask(size, "CROW_FEET_R")
    # The metric's eye-bag mask is the convex hull of the bag landmarks (which
    # connects the two under-eye strips across the nose).  Build the protected
    # region from that actual hull so no other perturbation can touch it.
    bag_mask = get_zone_mask((size, size, 3), TEMPLATE_LANDMARKS, ZONES["EYE_BAGS"], size, size)
    bag_zone = cv2.dilate(bag_mask, np.ones((11, 11), np.uint8))

    # Keep the under-eye band pristine: every perturbation EXCEPT puffiness is
    # excluded from it, so the masked bag-region Sobel variance responds only
    # to the puffiness blobs (cheek zones and the bag zone overlap in the real
    # landmark masks, which would otherwise drown the puffiness signal).
    protected = bag_zone
    cheeks_paint = cv2.bitwise_and(cheeks, cv2.bitwise_not(protected))
    face_zone = cv2.bitwise_and(cv2.bitwise_or(cheeks, cv2.bitwise_or(forehead, nose)),
                                cv2.bitwise_not(protected))
    result = img.copy()

    # Dark circles: darken the under-eye band (before cheek darkening so the
    # relative cheek - under-eye gap stays positive).  The factor is strong
    # enough to beat the cheek darkening caused by tanning / dullness.
    if tvals["dark_circles"] > 0.05:
        factor = 1.0 - (tvals["dark_circles"] / 10.0) * 0.9
        eye_zone = cv2.bitwise_and(eye_band, cv2.bitwise_not(protected))
        for c in range(3):
            ch = result[:, :, c].astype(np.float32)
            ch[eye_zone > 0] *= factor
            result[:, :, c] = np.clip(ch, 0, 255).astype(np.uint8)

    # Tanning: darken face (cheeks + forehead) overall.
    if tvals["tanning"] > 0.05:
        factor = 1.0 - (tvals["tanning"] / 10.0) * 0.55
        zone = cv2.bitwise_and(cv2.bitwise_or(cheeks, forehead), cv2.bitwise_not(protected))
        for c in range(3):
            ch = result[:, :, c].astype(np.float32)
            ch[zone > 0] *= factor
            result[:, :, c] = np.clip(ch, 0, 255).astype(np.uint8)

    # Dullness: darken cheeks.
    if tvals["dullness"] > 0.05:
        factor = 1.0 - (tvals["dullness"] / 10.0) * 0.5
        for c in range(3):
            ch = result[:, :, c].astype(np.float32)
            ch[cheeks_paint > 0] *= factor
            result[:, :, c] = np.clip(ch, 0, 255).astype(np.uint8)

    # Oiliness: bright highlights on the forehead.
    if tvals["oiliness"] > 0.05:
        count = int(tvals["oiliness"] * 0.008 * float(forehead.sum() / 255))
        ys, xs = np.where(forehead > 0)
        for _ in range(count):
            i = rng.integers(0, len(ys))
            result[ys[i], xs[i]] = (238, 240, 244)

    # Redness / sensitivity: raise LAB a* on the cheeks (erythema tint) —
    # deliberately NOT HSV-saturated red so it stays independent of the
    # HSV-red acne density signal.
    if tvals["redness"] > 0.05:
        lab = cv2.cvtColor(result, cv2.COLOR_BGR2LAB).astype(np.float32)
        lab[:, :, 1] += tvals["redness"] * 2.5 * (cheeks_paint > 0)
        result = cv2.cvtColor(np.clip(lab, 0, 255).astype(np.uint8), cv2.COLOR_LAB2BGR)

    # Acne: small red spots across the face.
    if tvals["acne"] > 0.05:
        for _ in range(int(round(tvals["acne"] * 10))):
            x, y = _random_point_in(face_zone, rng)
            cv2.circle(result, (x, y), 1, (40, 40, 230), -1)

    # Pigmentation: mild colour speckles on the cheeks.
    if tvals["pigmentation"] > 0.05:
        base = tuple(int(v) for v in np.mean(result[cheeks_paint > 0], axis=0))
        for _ in range(int(round(tvals["pigmentation"] * 3))):
            x, y = _random_point_in(cheeks_paint, rng)
            off = rng.integers(-25, 25, size=3)
            color = tuple(int(v) for v in np.clip(np.array(base, dtype=float) + off, 0, 255))
            cv2.circle(result, (x, y), int(rng.integers(1, 3)), color, -1)

    # Pores / texture: discrete dark specks on the cheeks give a graded
    # Laplacian-variance response (Gaussian noise saturates it too quickly).
    if tvals["pores"] > 0.05:
        for _ in range(int(round(tvals["pores"] * 10))):
            x, y = _random_point_in(cheeks_paint, rng)
            cv2.circle(result, (x, y), 1, (60, 55, 62), -1)
        sigma = 1.0
        noise = rng.normal(0, sigma, result.shape)
        for c in range(3):
            ch = result[:, :, c].astype(np.float32)
            ch += noise[:, :, c] * (cheeks_paint > 0)
            result[:, :, c] = np.clip(ch, 0, 255).astype(np.uint8)

    # Blackheads: dark specks on the nose.
    if tvals["blackheads"] > 0.05:
        nose_zone = cv2.bitwise_and(nose, cv2.bitwise_not(protected))
        for _ in range(int(round(tvals["blackheads"] * 4))):
            x, y = _random_point_in(nose_zone, rng)
            cv2.circle(result, (x, y), 1, (28, 26, 30), -1)

    # Fine lines / ageing: thin dark lines in the crow's-feet band.
    if tvals["aging"] > 0.05:
        crow_zone = cv2.bitwise_and(crow_band, cv2.bitwise_not(protected))
        for _ in range(int(round(tvals["aging"] * 2))):
            x, y = _random_point_in(crow_zone, rng)
            ang = rng.uniform(0.0, 180.0)
            length = int(rng.integers(8, 14))
            x2 = int(x + length * np.cos(np.radians(ang)))
            y2 = int(y + length * np.sin(np.radians(ang)))
            cv2.line(result, (x, y), (x2, y2), (30, 28, 34), 1)

    # Puffiness: sharp-edged under-eye blobs.  The blur stays LOCAL to the
    # eye-bag band so it never smears fine features painted elsewhere.
    if tvals["puffiness"] > 0.05:
        local = result.copy()
        for _ in range(2):
            x, y = _random_point_in(bag_mask, rng)
            radius = int(rng.integers(12, 22))
            shade = int(255 * (0.6 + 0.4 * (tvals["puffiness"] / 10.0)))
            cv2.circle(local, (x, y), radius, (shade, shade, shade), -1)
        blurred = cv2.GaussianBlur(local, (0, 0), sigmaX=1.5)
        result[bag_zone > 0] = blurred[bag_zone > 0]

    return result


# ---------------------------------------------------------------------------
# Label generation
# ---------------------------------------------------------------------------

DISPLAY_TO_CONCERN = {
    "Acne & Breakouts":          "acneLevel",
    "Blackheads / Whiteheads":   "blackheads",
    "Oily / Shiny Skin":         "oiliness",
    "Dry / Flaky Skin":          "dryness",
    "Sensitive / Redness":       "redness",
    "Dark Circles":              "darkCircles",
    "Dark Spots / Pigmentation": "pigmentation",
    "Melasma":                   "melasma",
    "Tanning / Sun Damage":      "tanning",
    "Enlarged Pores":            "poreVisibility",
    "Uneven Texture":            "texture",
    "Dullness / Lack of Radiance": "dullness",
    "Acne Scars / Marks":        "acneScars",
    "Ageing / Fine Lines":       "aging",
    "Under-eye Puffiness":       "puffiness",
    "Dehydration":               "dehydration",
    "Milia":                     "milia",
    "Sunburn / Irritation":      "sunburn",
}


def _clamp01(val: float) -> float:
    return round(float(max(0.0, min(1.0, val / 10.0))), 4)


def compute_labels(img: np.ndarray, size: int) -> tuple[dict[str, float], str]:
    """Run the CV heuristics and map to the 20 CONCERNS keys (0-1 values)."""
    metrics = compute_all_conditions(img, TEMPLATE_LANDMARKS, size, size)
    cond = metrics["conditions"]
    labels: dict[str, float] = {}
    for display, concern in DISPLAY_TO_CONCERN.items():
        labels[concern] = _clamp01(cond[display])
    # Derived signals the heuristics do not emit directly.
    dullness = cond["Dullness / Lack of Radiance"]
    dryness = cond["Dry / Flaky Skin"]
    labels["glowScore"] = _clamp01(max(0.0, min(10.0, 10.0 - dullness)))
    labels["hydration"] = _clamp01(max(0.0, min(10.0, 10.0 - dryness)))
    return labels, metrics["primary_skin_type"]


def sample_skin_tone(lightness: float) -> int:
    """Approximate Fitzpatrick I-VI from base skin lightness (purely cosmetic)."""
    tone = int(1 + round((205.0 - lightness) / 70.0 * 5.0))
    return int(np.clip(tone, 1, 6))


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def _sample_tvals(rng: np.random.Generator) -> dict[str, float]:
    return {k: float(rng.uniform(0.0, 10.0)) for k in CONDITION_KEYS}


def probe(count: int, seed: int, size: int) -> None:
    rng = np.random.default_rng(seed)
    keys = [c for c in CONCERNS]
    stats = {k: [] for k in keys}
    tones = []
    for i in range(count):
        img, L = make_base_face(size, rng)
        img = paint_perturbations(img, size, _sample_tvals(rng), rng)
        labels, _ = compute_labels(img, size)
        tones.append(sample_skin_tone(L))
        for k in keys:
            stats[k].append(labels[k])
    print(f"{'concern':<16}{'min':>8}{'max':>8}{'mean':>8}{'std':>8}")
    for k in keys:
        arr = np.array(stats[k])
        print(f"{k:<16}{arr.min():>8.3f}{arr.max():>8.3f}{arr.mean():>8.3f}{arr.std():>8.3f}")
    print(f"skin tones: min={min(tones)} max={max(tones)} "
          f"mean={np.mean(tones):.2f}")


def generate(count: int, output_dir: str, seed: int, size: int) -> None:
    rng = np.random.default_rng(seed)
    images_dir = os.path.join(output_dir, "images")
    os.makedirs(images_dir, exist_ok=True)

    rows = []
    for i in range(count):
        img, L = make_base_face(size, rng)
        img = paint_perturbations(img, size, _sample_tvals(rng), rng)
        labels, skin_type = compute_labels(img, size)
        filename = f"syn_{i:04d}.jpg"
        cv2.imwrite(os.path.join(images_dir, filename), img)
        row = {"filename": filename, **labels, "skin_tone": sample_skin_tone(L)}
        rows.append(row)
        if (i + 1) % 50 == 0:
            print(f"  generated {i + 1}/{count}")

    csv_path = os.path.join(output_dir, "labels.csv")
    with open(csv_path, "w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=["filename", *CONCERNS, "skin_tone"])
        writer.writeheader()
        writer.writerows(rows)
    print(f"Wrote {len(rows)} rows -> {csv_path}")
    print(f"Wrote {len(rows)} images -> {images_dir}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate synthetic distillation dataset")
    parser.add_argument("--output-dir", type=str, default="dist_dataset")
    parser.add_argument("--count", type=int, default=400)
    parser.add_argument("--probe", type=int, default=0,
                        help="Print label spread for N samples instead of writing files")
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--size", type=int, default=224)
    args = parser.parse_args()

    if args.probe:
        probe(args.probe, args.seed, args.size)
    else:
        generate(args.count, args.output_dir, args.seed, args.size)


if __name__ == "__main__":
    main()
