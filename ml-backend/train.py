"""
VitalScan Skin Analysis Model — Training Script
================================================
This script trains a multi-label MobileNetV2 model to predict 20 skin conditions
from face images. The model outputs a severity score (0–10) per condition.

────────────────────────────────────────────────────────────────────────────
DATASET FORMAT REQUIRED
────────────────────────────────────────────────────────────────────────────
Your dataset directory must look like this:

    dataset/
    ├── images/
    │   ├── img_001.jpg
    │   ├── img_002.jpg
    │   └── ...
    └── labels.csv

labels.csv format (values are 0.0 to 1.0, representing severity / 10):
    filename,acneLevel,darkCircles,oiliness,dryness,redness,poreVisibility,
             pigmentation,texture,glowScore,hydration,blackheads,melasma,
             tanning,dullness,acneScars,aging,puffiness,dehydration,milia,sunburn
    img_001.jpg,0.7,0.3,0.6,0.2,...
    img_002.jpg,0.1,0.5,0.4,0.8,...

────────────────────────────────────────────────────────────────────────────
USAGE
────────────────────────────────────────────────────────────────────────────
    python train.py --dataset ./dataset --epochs 30 --batch_size 16
"""

import os
import csv
import argparse
import random

from PIL import Image
import numpy as np
import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import Dataset, DataLoader, random_split
from torchvision import transforms

from model import SkinAnalysisModel, CONCERNS


def set_seed(seed: int) -> None:
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)


# ─── Dataset ─────────────────────────────────────────────────────────────────

class SkinDataset(Dataset):
    def __init__(self, csv_path: str, images_dir: str, transform=None):
        with open(csv_path, "r", encoding="utf-8", newline="") as fh:
            reader = csv.DictReader(fh)
            self.rows = [dict(row) for row in reader]
        self.images_dir = images_dir
        self.transform = transform
        print(f"Loaded {len(self.rows)} samples from {csv_path}")

    def __len__(self):
        return len(self.rows)

    def __getitem__(self, idx):
        row = self.rows[idx]
        img_path = os.path.join(self.images_dir, row["filename"])
        image = Image.open(img_path).convert("RGB")

        if self.transform:
            image = self.transform(image)

        # Labels are 0.0–1.0 (severity / 10)
        labels = torch.tensor(
            [float(row[concern]) for concern in CONCERNS],
            dtype=torch.float32,
        )
        return image, labels


# ─── Training Loop ────────────────────────────────────────────────────────────

def build_transform(train: bool):
    if train:
        return transforms.Compose([
            transforms.Resize((224, 224)),
            transforms.RandomHorizontalFlip(),
            transforms.ColorJitter(brightness=0.2, contrast=0.2, saturation=0.15),
            transforms.RandomRotation(8),
            transforms.ToTensor(),
            transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
        ])
    return transforms.Compose([
        transforms.Resize((224, 224)),
        transforms.ToTensor(),
        transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
    ])


def load_backbone(model: nn.Module, use_pretrained: bool) -> bool:
    """Copy ImageNet weights into the backbone; returns True if loaded."""
    if not use_pretrained:
        print("Backbone initialised from scratch (--no-pretrained).")
        return False
    from torchvision import models
    try:
        pretrained = models.mobilenet_v2(weights=models.MobileNet_V2_Weights.IMAGENET1K_V1)
    except Exception as exc:  # noqa: BLE001 - offline / download failure
        print(f"ImageNet weights unavailable ({exc}); using random init.")
        return False
    model.backbone.features.load_state_dict(pretrained.features.state_dict())
    print("Loaded pretrained ImageNet weights for backbone.")
    return True


def train(args):
    set_seed(args.seed)
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"Using device: {device}")

    csv_path = os.path.join(args.dataset, "labels.csv")
    images_dir = os.path.join(args.dataset, "images")
    full_dataset = SkinDataset(csv_path, images_dir)
    if len(full_dataset) == 0:
        raise SystemExit(f"No samples found in {csv_path}")

    val_size = max(1, int(len(full_dataset) * 0.2))
    train_size = len(full_dataset) - val_size
    train_dataset, val_dataset = random_split(
        full_dataset, [train_size, val_size],
        generator=torch.Generator().manual_seed(args.seed),
    )
    train_dataset.dataset.transform = build_transform(train=True)
    val_dataset.dataset.transform = build_transform(train=False)

    # num_workers=0 is required on Windows (multiprocessing inside DataLoader
    # would re-run the module under a fresh interpreter).
    train_loader = DataLoader(train_dataset, batch_size=args.batch_size,
                              shuffle=True, num_workers=0, drop_last=True)
    val_loader = DataLoader(val_dataset, batch_size=args.batch_size,
                            shuffle=False, num_workers=0)

    model = SkinAnalysisModel(num_classes=len(CONCERNS)).to(device)
    load_backbone(model, use_pretrained=not args.no_pretrained)

    criterion = nn.MSELoss()
    optimizer = optim.AdamW(model.parameters(), lr=args.lr, weight_decay=1e-4)
    scheduler = optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=args.epochs)

    os.makedirs(args.output_dir, exist_ok=True)
    best_val_loss = float("inf")

    for epoch in range(1, args.epochs + 1):
        model.train()
        train_loss = 0.0
        for images, labels in train_loader:
            images, labels = images.to(device), labels.to(device)
            optimizer.zero_grad()
            outputs = torch.sigmoid(model(images))
            loss = criterion(outputs, labels)
            loss.backward()
            optimizer.step()
            train_loss += loss.item() * images.size(0)
        train_loss /= len(train_loader.dataset)

        model.eval()
        val_loss = 0.0
        with torch.no_grad():
            for images, labels in val_loader:
                images, labels = images.to(device), labels.to(device)
                outputs = torch.sigmoid(model(images))
                loss = criterion(outputs, labels)
                val_loss += loss.item() * images.size(0)
        val_loss /= len(val_loader.dataset)

        scheduler.step()
        print(f"Epoch [{epoch:3d}/{args.epochs}]  Train Loss: {train_loss:.4f}  Val Loss: {val_loss:.4f}")

        if val_loss < best_val_loss:
            best_val_loss = val_loss
            torch.save(model.state_dict(), os.path.join(args.output_dir, "skin_model.pth"))
            print(f"  -> Saved best model (val_loss={val_loss:.4f})")

    print(f"\nTraining complete. Best validation loss: {best_val_loss:.4f}")
    print(f"Weights saved to: {os.path.join(args.output_dir, 'skin_model.pth')}")
    print("Restart uvicorn to load the new weights automatically.")


# ─── Entry Point ──────────────────────────────────────────────────────────────

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Train VitalScan Skin Analysis Model")
    parser.add_argument("--dataset",    type=str,   default="./dataset", help="Path to dataset directory")
    parser.add_argument("--epochs",     type=int,   default=30,          help="Number of training epochs")
    parser.add_argument("--batch_size", type=int,   default=16,          help="Training batch size")
    parser.add_argument("--lr",         type=float, default=1e-4,        help="Initial learning rate")
    parser.add_argument("--output-dir", type=str,   default="weights",   help="Where to save skin_model.pth")
    parser.add_argument("--seed",       type=int,   default=42,          help="RNG seed for reproducibility")
    parser.add_argument("--no-pretrained", action="store_true",
                        help="Skip the ImageNet backbone (requires no download)")
    args = parser.parse_args()
    train(args)
