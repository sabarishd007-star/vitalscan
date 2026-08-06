"""
eval.py — evaluation harness for the VitalScan skin model.

Computes per-condition accuracy metrics (AUROC + MAE) against a labeled
dataset and gates production rollout via optional thresholds.

Usage:
    python eval.py --dataset ./dataset --weights weights/skin_model.pth \
        --thresholds eval_thresholds.json --output eval_results.json

Exit code 0 => all metrics within thresholds, 1 => a threshold was missed
(or the run failed). This script must pass before MODEL_VALIDATED is set to
true in production.
"""
import argparse
import hashlib
import json
import os
import time

import numpy as np
from PIL import Image

from dataset import load_dataset
from model import SkinModelLoader, CONCERNS

# A condition is considered "present" when its severity is above this value.
PRESENT_AT = 5.0  # out of 10


def load_image(path: str) -> Image.Image:
    return Image.open(path).convert("RGB")


def sha256_file(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def auroc(labels: np.ndarray, scores: np.ndarray):
    """Area under the ROC curve (Mann-Whitney U, tie-aware). Returns None when
    only one class is present."""
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


def collect_predictions(loader: SkinModelLoader, entries: list[dict]):
    """Run inference over every entry. Returns (preds, truths, tones) where
    each is keyed by concern / parallel lists, all aligned by entry index."""
    preds = {c: [] for c in CONCERNS}
    truths = {c: [] for c in CONCERNS}
    tones = []
    for entry in entries:
        probs = loader.predict_probabilities(load_image(entry["path"]))
        for i, concern in enumerate(CONCERNS):
            preds[concern].append(float(probs[i]) * 10.0)
            truths[concern].append(entry["labels"][i])
        tones.append(entry["skin_tone"] or "unknown")
    return preds, truths, tones


def compute_metrics(preds: dict, truths: dict) -> dict:
    """Per-condition MAE (0-10 scale) and AUROC (label present > 5/10)."""
    conditions = {}
    aucs = []
    for concern in CONCERNS:
        p = np.asarray(preds[concern], dtype=float)
        t = np.asarray(truths[concern], dtype=float)
        mae = float(np.mean(np.abs(p - t)))
        auc = auroc(t > PRESENT_AT, p)
        conditions[concern] = {
            "mae": round(mae, 4),
            "auc": round(auc, 4) if auc is not None else None,
        }
        if auc is not None:
            aucs.append(auc)
    return {
        "conditions": conditions,
        "overall": {
            "mean_mae": round(float(np.mean([c["mae"] for c in conditions.values()])), 4),
            "mean_auc": round(float(np.mean(aucs)), 4) if aucs else None,
        },
    }


def evaluate_by_tone(loader: SkinModelLoader, entries: list[dict]) -> dict:
    breakdown = {}
    tones = {}
    for entry in entries:
        tones.setdefault(entry["skin_tone"] or "unknown", []).append(entry)
    for tone, subset in sorted(tones.items()):
        preds, truths, _ = collect_predictions(loader, subset)
        breakdown[tone] = compute_metrics(preds, truths)
    return breakdown


def load_thresholds(path: str) -> dict:
    with open(path, "r", encoding="utf-8") as fh:
        return json.load(fh)


def passes_thresholds(metrics: dict, thresholds: dict):
    """Returns (ok, report). Thresholds shape mirrors metrics:

        {"conditions": {"acneLevel": {"max_mae": 2.0, "min_auc": 0.6}, ...}}
    """
    ok = True
    report = []
    cond_thresholds = thresholds.get("conditions", {})
    for concern in CONCERNS:
        m = metrics["conditions"].get(concern, {})
        th = cond_thresholds.get(concern, {})
        reasons = []
        max_mae = th.get("max_mae")
        min_auc = th.get("min_auc")
        if max_mae is not None and m.get("mae") is not None and m["mae"] > max_mae:
            reasons.append(f"mae {m['mae']:.4f} > {max_mae}")
        if min_auc is not None and m.get("auc") is not None and m["auc"] < min_auc:
            reasons.append(f"auc {m['auc']:.4f} < {min_auc}")
        if reasons:
            ok = False
        report.append({
            "condition": concern,
            "mae": m.get("mae"),
            "auc": m.get("auc"),
            "thresholds": th,
            "status": "FAIL" if reasons else "PASS",
            "reasons": reasons,
        })
    return ok, report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dataset", required=True, help="Path to dataset dir (images/ + labels.csv)")
    parser.add_argument("--weights", default="weights/skin_model.pth")
    parser.add_argument("--calibration", default=None, help="Path to calibration.json (optional)")
    parser.add_argument("--thresholds", default=None, help="Path to eval_thresholds.json (optional)")
    parser.add_argument("--output", default="eval_results.json")
    parser.add_argument("--max-images", type=int, default=0, help="Limit dataset size (0 = all)")
    args = parser.parse_args()

    loader = SkinModelLoader(args.weights, calibration_path=args.calibration)
    entries = load_dataset(args.dataset)
    if args.max_images > 0:
        entries = entries[: args.max_images]
    if not entries:
        print("ERROR: no labeled images found in dataset")
        return 1

    start = time.time()
    preds, truths, tones = collect_predictions(loader, entries)
    metrics = compute_metrics(preds, truths)
    elapsed = time.time() - start

    result = {
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "weights_path": args.weights,
        "weights_sha256": sha256_file(args.weights) if os.path.exists(args.weights) else None,
        "calibration": args.calibration,
        "model_loaded": not loader.is_mock,
        "num_images": len(entries),
        "seconds": round(elapsed, 2),
        "overall": metrics["overall"],
        "conditions": metrics["conditions"],
        "by_skin_tone": evaluate_by_tone(loader, entries),
    }

    if args.thresholds:
        ok, report = passes_thresholds(metrics, load_thresholds(args.thresholds))
        result["thresholds"] = {"met": ok, "report": report}
    else:
        ok, report = passes_thresholds(metrics, {"conditions": {}})
        result["thresholds"] = {"met": True, "report": report, "note": "no thresholds supplied; reporting only"}

    with open(args.output, "w", encoding="utf-8") as fh:
        json.dump(result, fh, indent=2)
    print(json.dumps(result, indent=2))
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
