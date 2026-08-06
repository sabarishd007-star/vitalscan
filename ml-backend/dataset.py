"""
dataset.py — shared labeled-dataset loading for eval.py and calibrate.py.

Dataset layout (same contract as train.py):

    dataset/
    ├── images/
    │   ├── img_001.jpg
    │   └── ...
    └── labels.csv

labels.csv columns:  filename,acneLevel,...,sunburn[,skin_tone]
Label values are 0.0-1.0 (severity / 10). The optional 'skin_tone' column
(Fitzpatrick I-VI) enables per-tone reporting in the evaluation harness.
"""
import csv
import os

from model import CONCERNS


def load_dataset(dataset_dir: str) -> list[dict]:
    """
    Load a labeled dataset into entries.

    Each entry is::

        {"path": str, "labels": list[float] (0-10 severity), "skin_tone": str | None}

    Files listed in labels.csv that do not exist on disk are skipped so a
    partially-downloaded dataset still evaluates.
    """
    csv_path = os.path.join(dataset_dir, "labels.csv")
    images_dir = os.path.join(dataset_dir, "images")
    if not os.path.exists(csv_path):
        raise FileNotFoundError(f"labels.csv not found in {dataset_dir}")

    entries = []
    with open(csv_path, newline="", encoding="utf-8") as fh:
        for row in csv.DictReader(fh):
            filename = row.get("filename", "")
            path = os.path.join(images_dir, filename)
            if not filename or not os.path.exists(path):
                continue
            labels = []
            for concern in CONCERNS:
                try:
                    labels.append(float(row.get(concern, 0.0)))
                except (TypeError, ValueError):
                    labels.append(0.0)
            tone = (row.get("skin_tone") or "").strip() or None
            entries.append({
                "path": path,
                "labels": [round(v * 10.0, 4) for v in labels],
                "skin_tone": tone,
            })
    return entries
