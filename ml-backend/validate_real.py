"""
validate_real.py — Phase A: real-face robustness & plausibility harness.

Runs the FULL production pipeline on a small corpus of real photographic faces:

    decode -> face crop (MediaPipe -> Haar -> center) -> CLAHE LAB -> bilateral
        -> FaceMesh landmarks -> zone-masked CV metrics -> distilled MobileNetV2

This harness does NOT claim dermatological ground truth. No real medical labels
exist for these photos. The zone-masked CV metric pipeline is the *reference*
("CV labels") that the distilled model must reproduce — exactly the same
contract as the synthetic distillation loop. The added value over the synthetic
eval is that inputs here are genuine photographs with real pose, lighting,
compression and skin-tone variation.

Checks
------
1. Robustness  — every image flows through the pipeline without crashing; every
   model score and CV reference is finite and within [0, 10].
2. Detection   — fraction of images where FaceMesh yields landmarks on the
   preprocessed crop (full-frame fallback tracked separately).
3. Agreement   — per-condition MAE and presence-AUROC of model vs CV reference
   on real faces (0-10 scale, presence above 5.0).
4. Stability   — mean absolute per-condition delta under brightness +/-15% and
   JPEG q40 re-encode for both model scores and CV reference.
5. Tone spread — rough mean-lightness bins of the face crops so the coverage of
   this intentionally tiny corpus is explicit.

Output: real_eval_result.json plus a console report.

Usage:
    python validate_real.py [--corpus real_faces/images] [--weights weights/skin_model.pth]
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import time
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

from app.services.face_mesh import mp_face_mesh
from app.services.preprocessing import preprocess_skin_image
from app.services.skin_metrics import compute_all_conditions
from model import CONCERNS, SkinModelLoader

PRESENT_AT = 5.0  # a condition counts as "present" above 5/10
MAX_MAE_THRESHOLD = 1.5  # reference gate from eval_thresholds.example.json

DISPLAY_TO_CONCERN = {
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


def sha256_file(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def cv_labels_from_conditions(cond: dict) -> list[float]:
    """Map compute_all_conditions output to the 20 CONCERNS keys (0-10 scale),
    mirroring generate_synthetic_dataset.compute_labels."""
    labels: dict[str, float] = {}
    for display, concern in DISPLAY_TO_CONCERN.items():
        labels[concern] = round(float(cond[display]), 4)
    dullness = float(cond["Dullness / Lack of Radiance"])
    dryness = float(cond["Dry / Flaky Skin"])
    labels["glowScore"] = round(min(10.0, max(0.0, 10.0 - dullness)), 4)
    labels["hydration"] = round(min(10.0, max(0.0, 10.0 - dryness)), 4)
    return [labels[c] for c in CONCERNS]


def face_mesh_landmarks(rgb: np.ndarray) -> list | None:
    results = mp_face_mesh.process(rgb)
    if results.multi_face_landmarks:
        return results.multi_face_landmarks[0].landmark
    return None


def run_pipeline(loader: SkinModelLoader, image_bytes: bytes):
    """Full production pipeline. Returns a dict or None (no landmarks at all)."""
    crop = preprocess_skin_image(image_bytes)
    crop_rgb = cv2.cvtColor(crop, cv2.COLOR_BGR2RGB)
    h, w = crop.shape[:2]

    scope = "crop"
    landmarks = face_mesh_landmarks(crop_rgb)
    if landmarks is None:
        nparr = np.frombuffer(image_bytes, np.uint8)
        full = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if full is not None:
            landmarks = face_mesh_landmarks(cv2.cvtColor(full, cv2.COLOR_BGR2RGB))
            scope = "full"
    if landmarks is None:
        return None

    metrics = compute_all_conditions(crop, landmarks, w, h)
    cv_labels = cv_labels_from_conditions(metrics["conditions"])

    pil = Image.fromarray(crop_rgb)
    logits = loader.predict_logits(pil)
    probs = 1.0 / (1.0 + np.exp(-logits))
    preds = [round(float(p) * 10.0, 4) for p in probs]

    lab = cv2.cvtColor(crop, cv2.COLOR_BGR2LAB)
    mean_l = round(float(np.mean(lab[:, :, 0])), 1)

    return {
        "detection_scope": scope,
        "mean_lightness": mean_l,
        "cv_labels": cv_labels,
        "preds": preds,
        "primary_skin_type": metrics["primary_skin_type"],
    }


def perturb(image_bytes: bytes, kind: str) -> bytes | None:
    nparr = np.frombuffer(image_bytes, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if img is None:
        return None
    if kind == "bright+15":
        img = np.clip(img.astype(np.float32) * 1.15, 0, 255).astype(np.uint8)
    elif kind == "bright-15":
        img = np.clip(img.astype(np.float32) * 0.85, 0, 255).astype(np.uint8)
    elif kind == "jpeg-q40":
        ok, buf = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, 40])
        if not ok:
            return None
        return buf.tobytes()
    else:
        return None
    ok, buf = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, 90])
    if not ok:
        return None
    return buf.tobytes()


def auroc(labels: np.ndarray, scores: np.ndarray) -> float | None:
    labels = np.asarray(labels, dtype=bool)
    scores = np.asarray(scores, dtype=float)
    n_pos = int(labels.sum())
    n_neg = int((~labels).sum())
    if n_pos == 0 or n_neg == 0:
        return None
    order = np.argsort(scores, kind="mergesort")
    sorted_scores = scores[order]
    ranks = np.empty(len(scores))
    n = len(scores)
    i = 0
    while i < n:
        j = i
        while j + 1 < n and sorted_scores[j + 1] == sorted_scores[i]:
            j += 1
        avg_rank = (i + j) / 2.0 + 1.0
        for k in range(i, j + 1):
            ranks[order[k]] = avg_rank
        i = j + 1
    sum_ranks_pos = ranks[labels].sum()
    return float((sum_ranks_pos - n_pos * (n_pos + 1) / 2.0) / (n_pos * n_neg))


def mean_abs_delta(a: list[float], b: list[float]) -> float:
    return float(np.mean(np.abs(np.asarray(a, float) - np.asarray(b, float))))


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--corpus", default="real_faces/images", help="Dir of real-face images")
    parser.add_argument("--weights", default="weights/skin_model.pth")
    parser.add_argument("--output", default="real_eval_result.json")
    parser.add_argument("--perturbations", default="bright+15,bright-15,jpeg-q40")
    args = parser.parse_args()

    image_dir = Path(args.corpus)
    if not image_dir.is_dir():
        print(f"ERROR: corpus dir not found: {image_dir}")
        print("Run `python download_real_faces.py` first.")
        return 1

    files = sorted(p for p in image_dir.iterdir() if p.suffix.lower() in (".jpg", ".jpeg", ".png"))
    if not files:
        print(f"ERROR: no images in {image_dir}")
        return 1

    loader = SkinModelLoader(args.weights)
    pert_kinds = [k for k in args.perturbations.split(",") if k]

    results = []
    for p in files:
        data = p.read_bytes()
        base = run_pipeline(loader, data)
        if base is None:
            results.append({"filename": p.name, "detected": False})
            continue
        row = {
            "filename": p.name,
            "detected": True,
            "detection_scope": base["detection_scope"],
            "mean_lightness": base["mean_lightness"],
            "primary_skin_type": base["primary_skin_type"],
            "cv_labels": base["cv_labels"],
            "preds": base["preds"],
            "perturbations": {},
        }
        for kind in pert_kinds:
            pb = perturb(data, kind)
            if pb is None:
                continue
            res = run_pipeline(loader, pb)
            if res is None:
                row["perturbations"][kind] = {"detected": False}
            else:
                row["perturbations"][kind] = {
                    "detected": True,
                    "cv_labels": res["cv_labels"],
                    "preds": res["preds"],
                }
        results.append(row)

    detected = [r for r in results if r.get("detected")]
    n_det = len(detected)
    n_total = len(results)

    # ---- Agreement: model vs CV reference on unperturbed real faces --------
    conditions = {}
    aucs, maes = [], []
    for i, concern in enumerate(CONCERNS):
        truths = np.asarray([r["cv_labels"][i] for r in detected], float)
        preds = np.asarray([r["preds"][i] for r in detected], float)
        mae = float(np.mean(np.abs(preds - truths)))
        auc = auroc(truths > PRESENT_AT, preds)
        conditions[concern] = {
            "mae": round(mae, 4),
            "auc": round(auc, 4) if auc is not None else None,
            "n": n_det,
            "passes_max_mae_1.5": mae <= MAX_MAE_THRESHOLD,
        }
        maes.append(mae)
        if auc is not None:
            aucs.append(auc)

    # ---- Stability across perturbations ------------------------------------
    all_preds_deltas = {c: [] for c in CONCERNS}
    all_cv_deltas = {c: [] for c in CONCERNS}
    for r in detected:
        for kind, res in r["perturbations"].items():
            if not res.get("detected"):
                continue
            for i, concern in enumerate(CONCERNS):
                all_preds_deltas[concern].append(abs(r["preds"][i] - res["preds"][i]))
                all_cv_deltas[concern].append(abs(r["cv_labels"][i] - res["cv_labels"][i]))
    stability = {
        concern: {
            "model_mean_abs_delta": round(float(np.mean(v)), 4) if v else None,
            "cv_mean_abs_delta": round(float(np.mean(all_cv_deltas[concern])), 4) if all_cv_deltas[concern] else None,
            "perturbation_samples": len(all_preds_deltas[concern]),
        }
        for concern, v in all_preds_deltas.items()
    }

    # ---- Robustness --------------------------------------------------------
    all_vals = []
    for r in detected:
        all_vals.extend(r["preds"])
        all_vals.extend(r["cv_labels"])
    all_vals = np.asarray(all_vals, float)
    finite = bool(np.all(np.isfinite(all_vals)))
    in_range = bool(np.all((all_vals >= 0.0) & (all_vals <= 10.0)))

    # ---- Tone spread -------------------------------------------------------
    bins = {"dark (L*<120)": 0, "medium (120-160)": 0, "light (L*>160)": 0}
    for r in detected:
        l = r["mean_lightness"]
        if l < 120:
            bins["dark (L*<120)"] += 1
        elif l <= 160:
            bins["medium (120-160)"] += 1
        else:
            bins["light (L*>160)"] += 1

    # ---- CV-reference saturation --------------------------------------------
    # The metric clamp ranges (skin_metrics._clamp_min_max) were fit to smooth
    # synthetic renders. Real photographs carry natural texture/lighting detail
    # that pushes many raw signals past their max, pegging the CV score at 10.
    # A condition with high saturation cannot produce a discriminative real-face
    # reference, so model-vs-CV agreement on it is uninformative.
    cv_saturation_pct = {}
    for i, concern in enumerate(CONCERNS):
        col = np.asarray([r["cv_labels"][i] for r in detected], float)
        cv_saturation_pct[concern] = round(
            float(np.mean(col >= 9.95)) * 100.0, 1
        )

    puffiness = conditions["puffiness"]

    result = {
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "weights_path": args.weights,
        "weights_sha256": sha256_file(args.weights) if os.path.exists(args.weights) else None,
        "model_loaded": not loader.is_mock,
        "corpus_dir": str(image_dir),
        "num_images": n_total,
        "num_detected": n_det,
        "detection_rate": round(n_det / n_total, 4) if n_total else 0.0,
        "perturbations": pert_kinds,
        "robustness": {
            "all_scores_finite": finite,
            "all_scores_in_0_10": in_range,
            "min_score": round(float(all_vals.min()), 4),
            "max_score": round(float(all_vals.max()), 4),
        },
        "agreement": {
            "overall": {
                "mean_mae": round(float(np.mean(maes)), 4),
                "mean_auc": round(float(np.mean(aucs)), 4) if aucs else None,
            },
            "conditions": conditions,
        },
        "stability": stability,
        "tone_spread": {
            "bins": bins,
            "images": [{"filename": r["filename"], "mean_lightness": r["mean_lightness"]} for r in detected],
        },
        "cv_saturation_pct": cv_saturation_pct,
        "puffiness": {
            "model_vs_cv_mae": puffiness["mae"],
            "cv_range": [
                round(float(np.min([r["cv_labels"][CONCERNS.index("puffiness")] for r in detected])), 2),
                round(float(np.max([r["cv_labels"][CONCERNS.index("puffiness")] for r in detected])), 2),
            ],
            "model_range": [
                round(float(np.min([r["preds"][CONCERNS.index("puffiness")] for r in detected])), 2),
                round(float(np.max([r["preds"][CONCERNS.index("puffiness")] for r in detected])), 2),
            ],
            "cv_saturation_pct": cv_saturation_pct["puffiness"],
            "note": (
                "Puffiness is the weakest distilled condition on synthetic data "
                "(MAE ~1.6 vs 1.5 gate). On this real corpus its CV reference "
                "saturates (100% of faces peg at 10), so the low model-vs-CV MAE "
                "here is not evidence of real discrimination — it only shows the "
                "model tracks the saturated reference direction. Real puffiness "
                "discrimination is NOT validated by this corpus."
            ),
        },
        "limitations": (
            "No dermatological ground truth: CV labels are the reference the "
            "distilled model must reproduce. The CV metric clamp ranges were fit "
            "to smooth synthetic renders; on real photos several conditions "
            "saturate at 10 (see cv_saturation_pct), so real-face model-vs-CV "
            "agreement is only meaningful for unsaturated conditions. Corpus is "
            "17 hand-picked public sample images, skewing light (see tone_spread). "
            "Synthetic distillation eval remains the release gate."
        ),
        "per_image": [
            {
                "filename": r["filename"],
                "detected": r.get("detected"),
                "detection_scope": r.get("detection_scope"),
                "mean_lightness": r.get("mean_lightness"),
                "primary_skin_type": r.get("primary_skin_type"),
                "cv_labels": r.get("cv_labels"),
                "preds": r.get("preds"),
            }
            for r in results
        ],
    }

    with open(args.output, "w", encoding="utf-8") as fh:
        json.dump(result, fh, indent=2)

    # ---- Console report -----------------------------------------------------
    print(f"Model loaded from weights: {result['weights_sha256'] and result['weights_sha256'][:16]}...")
    print(f"Detection: {n_det}/{n_total} ({result['detection_rate'] * 100:.1f}%)")
    print(f"Robustness: finite={finite}, in-range(0-10)={in_range}, "
          f"min={result['robustness']['min_score']}, max={result['robustness']['max_score']}")
    print(f"Agreement (model vs CV reference, 0-10): "
          f"mean MAE={result['agreement']['overall']['mean_mae']}, "
          f"mean AUROC={result['agreement']['overall']['mean_auc']}")
    print(f"{'concern':<16}{'MAE':>8}{'AUROC':>8}  gate(1.5)")
    for concern in CONCERNS:
        c = conditions[concern]
        auc = f"{c['auc']:.4f}" if c["auc"] is not None else "   n/a"
        mark = "PASS" if c["passes_max_mae_1.5"] else "FAIL"
        print(f"{concern:<16}{c['mae']:>8.4f}{auc:>8}  {mark}")
    print(f"Tone spread: {bins}")
    saturated = [c for c in CONCERNS if cv_saturation_pct[c] >= 50.0]
    print(f"CV-reference saturated (>=50% faces pegged at 10): {', '.join(saturated) or 'none'}")
    worst = max(all_preds_deltas, key=lambda k: (stability[k]["model_mean_abs_delta"] or 0))
    print(f"Worst model stability: {worst} "
          f"(mean abs delta {stability[worst]['model_mean_abs_delta']} over {stability[worst]['perturbation_samples']} samples)")
    print(f"Puffiness model-vs-CV MAE: {puffiness['mae']} "
          f"(cv {result['puffiness']['cv_range']}, model {result['puffiness']['model_range']})")
    print(f"Wrote {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
