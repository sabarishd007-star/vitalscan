"""Face-Mesh-based, zone-localized cosmetic skin signal extraction.

These measurements are image-quality dependent cosmetic estimates, not medical
diagnoses. Keeping masks within the face mesh avoids using background, hair, or
beard pixels as skin signals.
"""
from __future__ import annotations

import cv2
import mediapipe as mp
import numpy as np

LEFT_UNDER_EYE = [33, 7, 163, 144, 145, 153, 154, 155, 133]
RIGHT_UNDER_EYE = [362, 382, 381, 380, 374, 373, 390, 249, 263]
LEFT_CHEEK = [117, 118, 101, 205, 207, 214, 192, 147, 123]
RIGHT_CHEEK = [346, 347, 348, 427, 434, 416, 433, 376, 352]
FOREHEAD = [10, 338, 297, 332, 284, 251, 21, 54, 103, 67, 109]
NOSE_T_ZONE = [168, 6, 197, 195, 5, 4, 1, 19, 94]

face_mesh = mp.solutions.face_mesh.FaceMesh(
    static_image_mode=True,
    max_num_faces=1,
    refine_landmarks=True,
    min_detection_confidence=0.7,
)


def _points(landmarks, indices: list[int], width: int, height: int) -> np.ndarray:
    return np.array(
        [[int(landmarks[index].x * width), int(landmarks[index].y * height)] for index in indices],
        dtype=np.int32,
    )


def _mask(shape: tuple[int, int], polygons: list[np.ndarray]) -> np.ndarray:
    mask = np.zeros(shape, dtype=np.uint8)
    cv2.fillPoly(mask, polygons, 255)
    return mask


def _mean(image: np.ndarray, mask: np.ndarray) -> float:
    pixels = image[mask > 0]
    return float(np.mean(pixels)) if pixels.size else 0.0


def _severity(value: float, low: float, high: float) -> float:
    return round(float(np.clip((value - low) / (high - low) * 10, 0, 10)), 1)


def _region(mask: np.ndarray) -> dict[str, float]:
    x, y, width, height = cv2.boundingRect(mask)
    image_height, image_width = mask.shape
    return {"x": round(x / image_width, 4), "y": round(y / image_height, 4), "w": round(width / image_width, 4), "h": round(height / image_height, 4)}


def analyze_face_regions(image_bgr: np.ndarray, landmarks=None) -> dict:
    """Return region-limited 0–10 cosmetic signals and normalized overlay boxes.

    ``landmarks`` may be supplied to avoid a second MediaPipe pass; when omitted
    the detector runs internally (used by callers that only need this service).
    """
    height, width = image_bgr.shape[:2]
    if landmarks is None:
        result = face_mesh.process(cv2.cvtColor(image_bgr, cv2.COLOR_BGR2RGB))
        if not result.multi_face_landmarks:
            raise ValueError("No face mesh detected. Face the camera with even front lighting and try again.")
        landmarks = result.multi_face_landmarks[0].landmark
    under_eye = _mask((height, width), [_points(landmarks, LEFT_UNDER_EYE, width, height), _points(landmarks, RIGHT_UNDER_EYE, width, height)])
    cheeks = _mask((height, width), [_points(landmarks, LEFT_CHEEK, width, height), _points(landmarks, RIGHT_CHEEK, width, height)])
    forehead = _mask((height, width), [_points(landmarks, FOREHEAD, width, height)])
    t_zone = _mask((height, width), [_points(landmarks, NOSE_T_ZONE, width, height), _points(landmarks, FOREHEAD, width, height)])

    lab = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2LAB)
    gray = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2GRAY)
    lightness, a_channel, _ = cv2.split(lab)

    # Under-eye L* delta is compared with cheek skin, never the full frame.
    dark_circles = _severity(max(0.0, _mean(lightness, cheeks) - _mean(lightness, under_eye)), 2.0, 24.0)

    # Laplacian values are sampled only inside cheek polygons (not zero-filled background).
    laplacian = np.abs(cv2.Laplacian(gray, cv2.CV_64F))
    pores = _severity(float(np.var(laplacian[cheeks > 0])) if np.any(cheeks) else 0.0, 20.0, 260.0)
    texture = _severity(float(np.mean(laplacian[cheeks > 0])) if np.any(cheeks) else 0.0, 8.0, 55.0)

    cheek_a = _mean(a_channel, cheeks)
    redness = _severity(cheek_a, 132.0, 158.0)
    t_zone_std = float(np.std(gray[t_zone > 0])) if np.any(t_zone) else 0.0
    oiliness = _severity(t_zone_std, 18.0, 58.0)
    dryness = round(float(np.clip((texture * 0.65) + max(0.0, 5.5 - oiliness) * 0.35, 0, 10)), 1)
    primary_skin_type = "Oily" if oiliness >= 6.5 else "Dry" if dryness >= 6.5 else "Combination" if oiliness >= 4.5 and dryness >= 4.5 else "Normal"

    return {
        "primary_skin_type": primary_skin_type,
        "metrics": {
            "dark_circles": {"score": dark_circles, "max": 10, "description": "Under-eye lightness difference compared with cheek skin."},
            "open_pores": {"score": pores, "max": 10, "description": "Fine texture frequency measured inside cheek regions."},
            "texture": {"score": texture, "max": 10, "description": "Cheek surface edge density estimate."},
            "redness": {"score": redness, "max": 10, "description": "Cheek colour-channel redness estimate."},
            "oiliness": {"score": oiliness, "max": 10, "description": "T-zone luminance variation estimate."},
            "dryness": {"score": dryness, "max": 10, "description": "Texture and low-oiliness cosmetic estimate."},
        },
        "bounding_regions": {
            "dark_circles": _region(under_eye),
            "open_pores": _region(cheeks),
            "texture": _region(cheeks),
            "redness": _region(cheeks),
            "oiliness": _region(t_zone),
            "dryness": _region(cheeks),
        },
    }
