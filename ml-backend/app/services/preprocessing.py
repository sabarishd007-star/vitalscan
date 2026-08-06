"""
app/services/preprocessing.py
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
Image preprocessing pipeline for VitalScan skin analysis.

Steps:
  1. Decode raw image bytes → BGR numpy array
  2. Detect & crop the face region (MediaPipe → Haar cascade → center fallback)
  3. Apply Bilateral Filter for edge-preserving noise smoothing
  4. CLAHE normalization in CIE LAB color space for illumination invariance

These are cosmetic image-quality estimates only, not medical diagnostics.
"""
from __future__ import annotations

import os
import cv2
import numpy as np
import mediapipe as mp


# ---------------------------------------------------------------------------
# Face detection helpers
# ---------------------------------------------------------------------------

def _mediapipe_crop(img: np.ndarray) -> np.ndarray | None:
    """Try MediaPipe Face Detection; return cropped BGR region or None."""
    try:
        if not (hasattr(mp, "solutions") and hasattr(mp.solutions, "face_detection")):
            return None
        h, w = img.shape[:2]
        detector = mp.solutions.face_detection.FaceDetection(min_detection_confidence=0.5)
        results = detector.process(cv2.cvtColor(img, cv2.COLOR_BGR2RGB))
        if results and results.detections:
            bbox = results.detections[0].location_data.relative_bounding_box
            xmin, ymin = int(bbox.xmin * w), int(bbox.ymin * h)
            box_w, box_h = int(bbox.width * w), int(bbox.height * h)
            pad_x, pad_y = int(box_w * 0.08), int(box_h * 0.08)
            x0, y0 = max(0, xmin - pad_x), max(0, ymin - pad_y)
            x1, y1 = min(w, xmin + box_w + pad_x), min(h, ymin + box_h + pad_y)
            crop = img[y0:y1, x0:x1]
            if crop.size > 0:
                return crop
    except Exception as err:
        print(f"[preprocessing] MediaPipe face detection notice: {err}")
    return None


def _haar_crop(img: np.ndarray) -> np.ndarray | None:
    """Try OpenCV Haar Cascade face detector; return cropped BGR region or None."""
    try:
        cascade_dir = getattr(getattr(cv2, "data", None), "haarcascades", "")
        cascade_path = cascade_dir + "haarcascade_frontalface_default.xml" if cascade_dir else ""
        if not (cascade_path and os.path.exists(cascade_path)):
            return None
        face_cascade = cv2.CascadeClassifier(cascade_path)
        if face_cascade.empty():
            return None
        h, w = img.shape[:2]
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        faces = face_cascade.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=4, minSize=(60, 60))
        if len(faces) > 0:
            x, y, fw, fh = faces[0]
            pad_x, pad_y = int(fw * 0.1), int(fh * 0.1)
            x0, y0 = max(0, x - pad_x), max(0, y - pad_y)
            x1, y1 = min(w, x + fw + pad_x), min(h, y + fh + pad_y)
            crop = img[y0:y1, x0:x1]
            if crop.size > 0:
                return crop
    except Exception as err:
        print(f"[preprocessing] OpenCV cascade notice: {err}")
    return None


def _center_crop(img: np.ndarray) -> np.ndarray:
    """Fallback: return the central 80% of the frame."""
    h, w = img.shape[:2]
    margin_x, margin_y = int(w * 0.1), int(h * 0.1)
    crop = img[margin_y : h - margin_y, margin_x : w - margin_x]
    return crop if crop.size > 0 else img


def crop_face_region(img: np.ndarray) -> np.ndarray:
    """
    Detect and crop the primary face region from a BGR image.

    Detection priority:
      1. MediaPipe FaceDetection (most accurate)
      2. OpenCV Haar Cascade (robust fallback)
      3. Center 80% crop (always succeeds)
    """
    result = _mediapipe_crop(img)
    if result is not None:
        return result
    result = _haar_crop(img)
    if result is not None:
        return result
    return _center_crop(img)


# ---------------------------------------------------------------------------
# Full preprocessing pipeline
# ---------------------------------------------------------------------------

def preprocess_skin_image(image_bytes: bytes) -> np.ndarray:
    """
    Decode raw image bytes and return a preprocessed BGR numpy array ready
    for CV metric extraction or PIL-based model inference.

    Pipeline:
      1. Decode JPEG/PNG/WebP bytes → BGR array
      2. Crop face region
      3. Bilateral filter  — smooths sensor noise while preserving pore / texture edges
      4. CLAHE on L* channel — corrects uneven lighting without oversaturating

    Returns
    -------
    np.ndarray  BGR image (uint8)

    Raises
    ------
    ValueError  if the byte string cannot be decoded as an image
    """
    nparr = np.frombuffer(image_bytes, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("Failed to decode image — ensure the upload is a valid JPEG, PNG, or WebP file.")

    # Step 1 — Face crop
    face = crop_face_region(img)

    # Step 2 — Bilateral filter (edge-preserving denoise)
    # d=9 neighbourhood diameter; sigmaColor/sigmaSpace=75 balances smoothing vs detail
    denoised = cv2.bilateralFilter(face, d=9, sigmaColor=75, sigmaSpace=75)

    # Step 3 — CLAHE normalization in CIE LAB color space
    lab = cv2.cvtColor(denoised, cv2.COLOR_BGR2LAB)
    l_chan, a_chan, b_chan = cv2.split(lab)
    clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8))
    l_eq = clahe.apply(l_chan)
    normalized = cv2.cvtColor(cv2.merge((l_eq, a_chan, b_chan)), cv2.COLOR_LAB2BGR)

    return normalized
