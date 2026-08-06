"""
app/services/face_mesh.py
~~~~~~~~~~~~~~~~~~~~~~~~~~
MediaPipe Face Mesh landmark zone definitions and mask utilities.

Provides:
  - A shared, module-level FaceMesh instance (static_image_mode)
  - Named landmark-index sets for each facial zone
  - get_zone_mask() — rasterises a landmark polygon onto a binary mask

All landmark indices reference the canonical 468-point MediaPipe face topology.
Zones deliberately exclude beard, neck, ears, and background pixels so that
downstream CV metrics measure only relevant facial skin.
"""
from __future__ import annotations

from typing import Any
import cv2
import mediapipe as mp
import numpy as np


# ---------------------------------------------------------------------------
# Shared FaceMesh instance
# ---------------------------------------------------------------------------

mp_face_mesh = mp.solutions.face_mesh.FaceMesh(
    static_image_mode=True,
    max_num_faces=1,
    refine_landmarks=True,
)


# ---------------------------------------------------------------------------
# Landmark zone index sets
# ---------------------------------------------------------------------------

ZONES: dict[str, list[int]] = {
    # Central forehead — avoids hairline and lateral temples
    "FOREHEAD": [10, 338, 297, 332, 284, 251, 21, 54, 103, 67, 109],

    # Cheeks — avoids nasolabial fold, beard, and jaw
    "LEFT_CHEEK": [117, 118, 101, 205, 207, 214, 129, 203, 98],
    "RIGHT_CHEEK": [346, 347, 348, 425, 427, 434, 358, 423, 327],

    # Nose — T-zone sebum signal
    "NOSE": [6, 197, 195, 5, 4, 1, 19, 94, 2, 98, 327],

    # Lower eyelid strip — dark circles signal
    "UNDER_EYES": [
        33, 7, 163, 144, 145, 153, 154, 155, 133,
        362, 382, 381, 380, 374, 373, 390, 249, 263,
    ],

    # Lateral eye corners — fine lines / crow's feet signal
    "CROW_FEET": [
        33, 130, 246, 161, 160, 159, 158, 157, 173,
        263, 359, 466, 388, 387, 386, 385, 384, 398,
    ],

    # Lower orbital rim — puffiness signal
    "EYE_BAGS": [
        130, 226, 247, 30, 29, 27, 28, 56, 190,
        243, 463, 414, 286, 258, 257, 259, 260, 467,
    ],
}


# ---------------------------------------------------------------------------
# Mask utility
# ---------------------------------------------------------------------------

def get_zone_mask(
    img_shape: tuple[int, int, int],
    landmarks: list[Any],
    indices: list[int],
    img_w: int,
    img_h: int,
) -> np.ndarray:
    """
    Rasterise a convex landmark polygon into a single-channel uint8 mask.

    Parameters
    ----------
    img_shape : (H, W, C) shape of the source image
    landmarks : MediaPipe landmark list (landmark[i].x / .y are normalised 0-1)
    indices   : Landmark indices defining the polygon vertices
    img_w, img_h : Pixel dimensions of the source image

    Returns
    -------
    np.ndarray  shape (H, W), dtype uint8, 255 inside the polygon, 0 outside
    """
    mask = np.zeros(img_shape[:2], dtype=np.uint8)
    valid_indices = [idx for idx in indices if idx < len(landmarks)]
    if not valid_indices:
        return mask
    points = np.array(
        [[int(landmarks[idx].x * img_w), int(landmarks[idx].y * img_h)] for idx in valid_indices],
        dtype=np.int32,
    )
    cv2.fillConvexPoly(mask, points, 255)
    return mask
