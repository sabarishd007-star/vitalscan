"""
Generate Mock Weights for VitalScan Skin Analysis Model
========================================================
Run this script ONCE to create a randomly-initialized weights file at:
    weights/skin_model.pth

This allows you to test the FULL ML pipeline (real PyTorch inference)
before you have a trained model. Results will be random but structurally
correct — the backend will use the real model code path, not the heuristic fallback.

Usage:
    python generate_mock_weights.py

When you have real trained weights, simply replace weights/skin_model.pth with
the actual trained file. No other changes needed.
"""

import os
import torch
from model import SkinAnalysisModel

def generate_mock_weights(output_path: str = "weights/skin_model.pth"):
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    
    print("Creating SkinAnalysisModel with random initialization...")
    model = SkinAnalysisModel()
    
    print(f"Saving mock weights to: {output_path}")
    torch.save(model.state_dict(), output_path)
    
    # Verify file was saved
    size_mb = os.path.getsize(output_path) / (1024 * 1024)
    print(f"Done. File size: {size_mb:.1f} MB")
    print("\nThe backend will now run in REAL ML mode using these random weights.")
    print("Replace the file with actual trained weights for production use.")

if __name__ == "__main__":
    generate_mock_weights()
