"""
calibrate.py — fit per-condition Platt scaling so reported confidence is honest.

Fits p = sigmoid(a * z + b) per condition, where z is the model logit and the
target is the binary severity label (severity / 10 > 0.5). Writes a
calibration.json consumed by SkinModelLoader at inference time.

Usage:
    python calibrate.py --dataset ./dataset --weights weights/skin_model.pth \
        --output calibration.json
"""
import argparse
import json
import os

import numpy as np
import torch
from PIL import Image

from dataset import load_dataset
from model import SkinModelLoader, CONCERNS

PRESENT_AT = 5.0  # out of 10


def fit_platt(logits: np.ndarray, binary_labels: np.ndarray, steps: int = 500, lr: float = 1e-1):
    """Fit a, b minimizing BCE(p, y) with p = sigmoid(a * z + b)."""
    z = torch.tensor(np.asarray(logits, dtype=np.float32).reshape(-1))
    y = torch.tensor(np.asarray(binary_labels, dtype=np.float32).reshape(-1))
    if len(y) == 0 or int(y.sum()) == 0 or int((1.0 - y).sum()) == 0:
        return {"a": 1.0, "b": 0.0}
    a = torch.tensor(1.0, requires_grad=True)
    b = torch.tensor(0.0, requires_grad=True)
    optimizer = torch.optim.Adam([a, b], lr=lr)
    for _ in range(steps):
        optimizer.zero_grad()
        p = torch.sigmoid(a * z + b)
        loss = -torch.mean(y * torch.log(p + 1e-9) + (1.0 - y) * torch.log(1.0 - p + 1e-9))
        loss.backward()
        optimizer.step()
    return {"a": round(float(a.item()), 6), "b": round(float(b.item()), 6)}


def collect_logits(loader: SkinModelLoader, entries: list[dict]):
    """Returns (logits_by_concern, labels_by_concern, binary_by_concern)."""
    logits = {c: [] for c in CONCERNS}
    labels = {c: [] for c in CONCERNS}
    for entry in entries:
        z = loader.predict_logits(Image.open(entry["path"]).convert("RGB"))
        for i, concern in enumerate(CONCERNS):
            logits[concern].append(float(z[i]))
            labels[concern].append(entry["labels"][i])
    return logits, labels


def fit_calibration(entries: list[dict], weights_path: str = "weights/skin_model.pth"):
    """Full pipeline; returns the calibration dict (and holds loader)."""
    loader = SkinModelLoader(weights_path)
    logits, labels = collect_logits(loader, entries)
    conditions = {}
    for concern in CONCERNS:
        z = np.asarray(logits[concern], dtype=float)
        y = np.asarray([l > PRESENT_AT for l in labels[concern]], dtype=float)
        conditions[concern] = fit_platt(z, y)
    return {
        "version": 1,
        "weights": os.path.basename(weights_path),
        "fit_on": len(entries),
        "present_at": PRESENT_AT,
        "conditions": conditions,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dataset", required=True, help="Path to dataset dir (images/ + labels.csv)")
    parser.add_argument("--weights", default="weights/skin_model.pth")
    parser.add_argument("--output", default="calibration.json")
    args = parser.parse_args()

    entries = load_dataset(args.dataset)
    if not entries:
        print("ERROR: no labeled images found in dataset")
        return 1

    calibration = fit_calibration(entries, args.weights)
    with open(args.output, "w", encoding="utf-8") as fh:
        json.dump(calibration, fh, indent=2)
    print(json.dumps(calibration, indent=2))
    print(f"Wrote {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
