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
PUBLIC DATASETS YOU CAN USE
────────────────────────────────────────────────────────────────────────────
1. ISIC Archive (skin lesion images) — https://www.isic-archive.com
2. ACNE04 Dataset — https://github.com/xpwu95/LDL
3. FFHQ (high-quality face images) — https://github.com/NVlabs/ffhq-dataset

────────────────────────────────────────────────────────────────────────────
USAGE
────────────────────────────────────────────────────────────────────────────
    python train.py --dataset ./dataset --epochs 30 --batch_size 16

────────────────────────────────────────────────────────────────────────────
"""

import os
import argparse
import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import Dataset, DataLoader, random_split
from torchvision import transforms
from PIL import Image
import pandas as pd
import numpy as np
from model import SkinAnalysisModel, CONCERNS


# ─── Dataset ─────────────────────────────────────────────────────────────────

class SkinDataset(Dataset):
    def __init__(self, csv_path: str, images_dir: str, transform=None):
        self.data = pd.read_csv(csv_path)
        self.images_dir = images_dir
        self.transform = transform
        print(f"Loaded {len(self.data)} samples from {csv_path}")

    def __len__(self):
        return len(self.data)

    def __getitem__(self, idx):
        row = self.data.iloc[idx]
        img_path = os.path.join(self.images_dir, row["filename"])
        image = Image.open(img_path).convert("RGB")

        if self.transform:
            image = self.transform(image)

        # Labels are 0.0–1.0 (severity / 10)
        labels = torch.tensor(
            [row[concern] for concern in CONCERNS],
            dtype=torch.float32
        )
        return image, labels


# ─── Training Loop ────────────────────────────────────────────────────────────

def train(args):
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"Using device: {device}")

    # Transforms
    train_transform = transforms.Compose([
        transforms.Resize((224, 224)),
        transforms.RandomHorizontalFlip(),
        transforms.ColorJitter(brightness=0.3, contrast=0.3, saturation=0.2),
        transforms.RandomRotation(10),
        transforms.ToTensor(),
        transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225])
    ])
    val_transform = transforms.Compose([
        transforms.Resize((224, 224)),
        transforms.ToTensor(),
        transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225])
    ])

    # Dataset
    csv_path = os.path.join(args.dataset, "labels.csv")
    images_dir = os.path.join(args.dataset, "images")
    full_dataset = SkinDataset(csv_path, images_dir)

    # Train/val split (80/20)
    val_size = int(len(full_dataset) * 0.2)
    train_size = len(full_dataset) - val_size
    train_dataset, val_dataset = random_split(full_dataset, [train_size, val_size])

    train_dataset.dataset.transform = train_transform
    val_dataset.dataset.transform = val_transform

    train_loader = DataLoader(train_dataset, batch_size=args.batch_size, shuffle=True, num_workers=2)
    val_loader = DataLoader(val_dataset, batch_size=args.batch_size, shuffle=False, num_workers=2)

    # Model
    model = SkinAnalysisModel(num_classes=len(CONCERNS)).to(device)
    
    # Load pretrained ImageNet backbone for transfer learning
    from torchvision import models
    pretrained = models.mobilenet_v2(weights=models.MobileNet_V2_Weights.IMAGENET1K_V1)
    # Copy backbone weights (excluding final classifier)
    model.backbone.features.load_state_dict(pretrained.features.state_dict())
    print("Loaded pretrained ImageNet weights for backbone.")

    # Loss & Optimizer
    # MSE for regression (predicting 0–1 severity from sigmoid output)
    criterion = nn.MSELoss()
    optimizer = optim.AdamW(model.parameters(), lr=args.lr, weight_decay=1e-4)
    scheduler = optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=args.epochs)

    os.makedirs("weights", exist_ok=True)
    best_val_loss = float("inf")

    for epoch in range(1, args.epochs + 1):
        # ─── Train ───
        model.train()
        train_loss = 0.0
        for images, labels in train_loader:
            images, labels = images.to(device), labels.to(device)
            optimizer.zero_grad()
            outputs = torch.sigmoid(model(images))   # normalize to [0, 1]
            loss = criterion(outputs, labels)
            loss.backward()
            optimizer.step()
            train_loss += loss.item() * images.size(0)
        train_loss /= len(train_loader.dataset)

        # ─── Validate ───
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

        # Save best model
        if val_loss < best_val_loss:
            best_val_loss = val_loss
            torch.save(model.state_dict(), "weights/skin_model.pth")
            print(f"  ✅ Saved best model (val_loss={val_loss:.4f}) → weights/skin_model.pth")

    print(f"\nTraining complete. Best validation loss: {best_val_loss:.4f}")
    print("Weights saved to: weights/skin_model.pth")
    print("Restart uvicorn to load the new weights automatically.")


# ─── Entry Point ──────────────────────────────────────────────────────────────

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Train VitalScan Skin Analysis Model")
    parser.add_argument("--dataset",    type=str,   default="./dataset", help="Path to dataset directory")
    parser.add_argument("--epochs",     type=int,   default=30,          help="Number of training epochs")
    parser.add_argument("--batch_size", type=int,   default=16,          help="Training batch size")
    parser.add_argument("--lr",         type=float, default=1e-4,        help="Initial learning rate")
    args = parser.parse_args()
    train(args)
