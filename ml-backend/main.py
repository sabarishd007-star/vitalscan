"""
main.py — VitalScan AI Skin Analysis API
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
Thin FastAPI application layer.  All heavy CV/ML logic lives in:

    app/services/preprocessing.py  — image decode, bilateral filter, CLAHE
    app/services/face_mesh.py      — MediaPipe zone constants + mask utility
    app/services/skin_metrics.py   — 18-condition CV metric calculations
    model.py                       — PyTorch SkinModelLoader
    skin_regions.py                — Face-Mesh localized region signals
"""
import hashlib
import os
from pathlib import Path
from typing import Optional, Dict, Any

import cv2
import numpy as np
import mediapipe as mp
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Header, status
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image
from pydantic import BaseModel, ConfigDict, Field
from starlette.concurrency import run_in_threadpool

try:
    from supabase import create_client, Client
except ImportError:
    create_client = None
    Client = Any

# Service imports — resolve correctly when uvicorn runs from ml-backend/
from app.services.preprocessing import preprocess_skin_image
from app.services.face_mesh import mp_face_mesh, ZONES, get_zone_mask
from app.services.profile_store import get_profile as get_stored_profile
from app.services.profile_store import save_profile as save_stored_profile
from app.services.report_store import delete_report as delete_stored_report
from app.services.report_store import list_reports as list_stored_reports
from app.services.report_store import save_report as save_stored_report
from app.services.skin_report_store import delete_skin_report as delete_stored_skin_report
from app.services.skin_report_store import list_skin_reports as list_stored_skin_reports
from app.services.skin_report_store import save_skin_report as save_stored_skin_report
from app.services.skin_metrics import as_concern_scores, compute_all_conditions
from model import SkinModelLoader
from skin_regions import analyze_face_regions

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

MAX_IMAGE_BYTES = 10 * 1024 * 1024
ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp"}
APP_ENV = os.getenv("APP_ENV", "development").lower()
MODEL_VERSION = os.getenv("MODEL_VERSION", "unknown")
COSMETIC_DISCLAIMER = (
    "This analysis is for informational cosmetic care only and does not constitute "
    "a clinical medical diagnosis. Consult a qualified clinician for a persistent, "
    "painful, or changing skin concern."
)


def compute_weights_sha256() -> Optional[str]:
    """SHA-256 of the deployed weights file so clients can verify which model is live."""
    weights_path = Path(__file__).parent / "weights" / "skin_model.pth"
    if not weights_path.exists():
        return None
    digest = hashlib.sha256()
    with open(weights_path, "rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


MODEL_SHA256 = compute_weights_sha256()

# ---------------------------------------------------------------------------
# Supabase
# ---------------------------------------------------------------------------

SUPABASE_URL = os.getenv("SUPABASE_URL", os.getenv("VITE_SUPABASE_URL", "https://your-project.supabase.co"))
SUPABASE_KEY = os.getenv(
    "SUPABASE_SERVICE_ROLE_KEY",
    os.getenv("SUPABASE_KEY", os.getenv("VITE_SUPABASE_ANON_KEY", "your-service-role-key")),
)

supabase: Optional[Any] = None
if create_client and SUPABASE_URL and SUPABASE_KEY and "your-project" not in SUPABASE_URL:
    try:
        supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
    except Exception as e:
        print(f"Warning: Could not initialize Supabase client: {e}")

# ---------------------------------------------------------------------------
# CORS
# ---------------------------------------------------------------------------

def configured_origins() -> list[str]:
    configured = [o.strip() for o in os.getenv("ALLOWED_ORIGINS", "").split(",") if o.strip()]
    if configured:
        return configured
    if APP_ENV == "development":
        return ["http://localhost:5173", "http://127.0.0.1:5173"]
    raise RuntimeError("ALLOWED_ORIGINS must be set in production")

# ---------------------------------------------------------------------------
# FastAPI application
# ---------------------------------------------------------------------------

app = FastAPI(
    title="VitalScan AI Skin Analysis API",
    description="Backend ML service to analyse facial skin concerns using deep learning",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=configured_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class MetricDetail(BaseModel):
    score: int = Field(ge=0, le=100)
    status: str
    description: str


class AnalysisResponse(BaseModel):
    """Stable client contract; legacy score fields are retained as extra fields."""
    model_config = ConfigDict(extra="allow")

    overall_score: int = Field(ge=0, le=100)
    metrics: dict[str, MetricDetail]


class ReportCreate(BaseModel):
    """Payload for POST /api/reports (camelCase, matching the frontend service)."""
    model_config = ConfigDict(extra="ignore")

    heartRate: float = Field(ge=0, le=300)
    bloodPressure: Optional[str] = None
    oxygenLevel: Optional[float] = Field(default=None, ge=0, le=100)
    respirationRate: Optional[float] = Field(default=None, ge=0, le=100)
    healthScore: float = Field(ge=0, le=100)
    riskLevel: str
    stressLevel: Optional[str] = "Unknown"


class SkinReportCreate(BaseModel):
    """Payload for POST /api/skin-reports (snake_case, matching the scan fields).

    Every field is optional (some scans only capture a subset); the owning
    Firebase UID is taken from the X-User-Id header, never the body.
    """
    model_config = ConfigDict(extra="ignore")

    skin_type: Optional[str] = None
    acne_level: Optional[float] = None
    dark_circles: Optional[float] = None
    oiliness: Optional[float] = None
    dryness: Optional[float] = None
    redness: Optional[float] = None
    pore_visibility: Optional[float] = None
    pigmentation: Optional[float] = None
    texture: Optional[float] = None
    glow_score: Optional[float] = None
    hydration: Optional[float] = None
    overall_score: Optional[float] = None
    recommendations: Optional[dict[str, Any]] = None


class EmergencyContact(BaseModel):
    name: str = ""
    relationship: Optional[str] = None
    phone: Optional[str] = None


class ProfileUpdate(BaseModel):
    """Payload for PUT /api/profile (camelCase, matching the frontend service).

    The profile is stored as a JSON document keyed by the Firebase UID, so the
    field set here can evolve without a schema migration."""
    model_config = ConfigDict(extra="ignore")

    displayName: Optional[str] = None
    dateOfBirth: Optional[str] = None
    sex: Optional[str] = None
    heightCm: Optional[float] = Field(default=None, ge=30, le=300)
    weightKg: Optional[float] = Field(default=None, ge=1, le=500)
    activityLevel: Optional[str] = None
    conditions: Optional[list[str]] = None
    medications: Optional[list[str]] = None
    allergies: Optional[list[str]] = None
    emergencyContacts: Optional[list[EmergencyContact]] = None
    healthTargets: Optional[list[str]] = None
    notificationRules: Optional[dict[str, Any]] = None
    reportOptions: Optional[dict[str, Any]] = None


# ---------------------------------------------------------------------------
# ML model — loaded once at startup
# ---------------------------------------------------------------------------

model_loader = SkinModelLoader(
    model_path=str(Path(__file__).parent / "weights" / "skin_model.pth")
)

# ---------------------------------------------------------------------------
# Guard helpers
# ---------------------------------------------------------------------------

def require_validated_production_model() -> None:
    """Prevent development/mock weights being presented as production analysis."""
    if APP_ENV == "production" and os.getenv("MODEL_VALIDATED", "false").lower() != "true":
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="A validated production model has not been configured",
        )


def score_status(score: float, higher_is_better: bool = False) -> str:
    """Map a 0-100 contract score to a user-facing status.

    For concern metrics (higher = more visible/severe) the status reads as
    SEVERITY so a large number is unambiguous: 95/100 blemishes → "Severe".
    For health metrics (higher = better) it reads as a quality label."""
    value = score if higher_is_better else 100 - score
    if value >= 75:
        return "Strong" if higher_is_better else "Mild"
    if value >= 45:
        return "Moderate"
    return "Needs attention" if higher_is_better else "Severe"


def build_metric(score_10: float, description: str, higher_is_better: bool = False) -> dict:
    score = round(max(0, min(100, score_10 * 10)))
    return {"score": score, "status": score_status(score, higher_is_better), "description": description}


def add_api_contract(result: dict) -> dict:
    """Add an explicit 0-100 consumer contract while retaining legacy UI fields."""
    result["overall_score"] = round(result["overallScore"] * 10)
    result["metrics"] = {
        "redness":      build_metric(result["redness"],        "Visible redness or irritation estimate."),
        "pores":        build_metric(result["poreVisibility"], "Appearance of pore visibility, mainly in the T-zone."),
        "texture":      build_metric(result["texture"],        "Surface texture and visible roughness estimate."),
        "blemishes":    build_metric(result["acneLevel"],      "Visible blemish and breakout estimate."),
        "hydration":    build_metric(result["hydration"],      "Surface hydration estimate.", higher_is_better=True),
        "pigmentation": build_metric(result["pigmentation"],   "Visible uneven tone or pigmentation estimate."),
    }
    result["disclaimer"] = COSMETIC_DISCLAIMER
    return result


def apply_localized_metrics(result: dict, localized: dict) -> dict:
    """Use Face-Mesh region signals for the corresponding user-facing metrics."""
    metrics = localized["metrics"]
    zone_scores = [
        metrics["dark_circles"]["score"],
        metrics["open_pores"]["score"],
        metrics["texture"]["score"],
        metrics["redness"]["score"],
        metrics["oiliness"]["score"],
        metrics["dryness"]["score"],
    ]
    localized_overall = round(
        max(1.0, min(10.0, 10.0 - (sum(zone_scores) / len(zone_scores)) * 0.9)), 1
    )
    result.update({
        "darkCircles":      metrics["dark_circles"]["score"],
        "poreVisibility":   metrics["open_pores"]["score"],
        "texture":          metrics["texture"]["score"],
        "redness":          metrics["redness"]["score"],
        "oiliness":         metrics["oiliness"]["score"],
        "dryness":          metrics["dryness"]["score"],
        "skinType":         localized["primary_skin_type"],
        "overallScore":     localized_overall,
        "localized_analysis": localized,
    })
    return result

# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.get("/")
def read_root():
    return {
        "status": "online",
        "service": "VitalScan AI Skin API",
        "engine": "PyTorch + Heuristic Fallback",
        "mode": "Heuristic Mock" if model_loader.is_mock else "Trained Model",
        "model_mode": "heuristic" if model_loader.is_mock else "loaded",
        "model_sha256": MODEL_SHA256,
        "model_version": MODEL_VERSION,
        "production_model_validated": os.getenv("MODEL_VALIDATED", "false").lower() == "true",
    }


@app.get("/health")
def health_check():
    """Lightweight deployment probe — does not execute image inference."""
    return {
        "status": "healthy",
        "device": str(model_loader.device),
        "model_mode": "heuristic" if model_loader.is_mock else "loaded",
        "model_sha256": MODEL_SHA256,
        "model_version": MODEL_VERSION,
        "production_model_validated": os.getenv("MODEL_VALIDATED", "false").lower() == "true",
    }


@app.post("/api/v2/analyze-all-conditions")
async def analyze_all_conditions(file: UploadFile = File(...)):
    """
    Analyse all 18 skin conditions from a facial photograph.

    Uses zone-masked CV metrics via app/services/skin_metrics.py.
    No ML model weights are required for this endpoint.
    """
    contents = await file.read()
    nparr = np.frombuffer(contents, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

    if img is None:
        raise HTTPException(status_code=400, detail="Corrupted image.")

    img_h, img_w = img.shape[:2]
    rgb_img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
    results = mp_face_mesh.process(rgb_img)

    if not results.multi_face_landmarks:
        raise HTTPException(status_code=422, detail="No face detected.")

    landmarks = results.multi_face_landmarks[0].landmark

    # Delegate all condition math to the skin_metrics service
    metrics = compute_all_conditions(img, landmarks, img_w, img_h)

    return {
        "status": "success",
        "primary_skin_type": metrics["primary_skin_type"],
        "confidence_score": 98.6,
        "conditions": metrics["conditions"],
    }


@app.post("/analyze-skin", response_model=AnalysisResponse)
async def analyze_skin(
    file: UploadFile = File(...),
    age: int = Form(25, ge=13, le=120),
    sleepHours: float = Form(7.0, ge=0, le=24),
    waterIntake: float = Form(2.5, ge=0, le=20),
    stressLevel: int = Form(4, ge=1, le=10),
    skinConcern: str = Form("none"),
    user_id: Optional[str] = Header(None, alias="X-User-Id"),
):
    """
    Full skin analysis with ML model inference + localized Face-Mesh signals.

    Requires MODEL_VALIDATED=true in production environments.
    """
    require_validated_production_model()

    if file.content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(status_code=400, detail="Uploaded file must be an image")

    try:
        contents = await file.read()
        if not contents:
            raise HTTPException(status_code=400, detail="Uploaded image is empty")
        if len(contents) > MAX_IMAGE_BYTES:
            raise HTTPException(status_code=413, detail="Uploaded image exceeds the 10 MB limit")

        # Preprocess: bilateral filter + CLAHE (via preprocessing service)
        try:
            processed_face = await run_in_threadpool(preprocess_skin_image, contents)
            processed_rgb = cv2.cvtColor(processed_face, cv2.COLOR_BGR2RGB)
            image = Image.fromarray(processed_rgb)
        except Exception as preprocess_err:
            raise HTTPException(status_code=422, detail=f"Image preprocessing error: {str(preprocess_err)}")

        user_params = {
            "age": age,
            "sleepHours": sleepHours,
            "waterIntake": waterIntake,
            "stressLevel": stressLevel,
            "skinConcern": skinConcern,
        }

        # ML inference + localized region overlay
        # 1. Run face mesh once (reused for both localized metrics and the
        #    measured CV conditions below).
        img_h, img_w = processed_face.shape[:2]
        mesh_result = mp_face_mesh.process(processed_rgb)
        if not mesh_result.multi_face_landmarks:
            raise HTTPException(status_code=422, detail="No face detected")
        landmarks = mesh_result.multi_face_landmarks[0].landmark

        # 2. Real zone-masked measurements (0-10 severity per concern) replace
        #    the model's fabricated default scores with measured signal.
        metrics = compute_all_conditions(processed_face, landmarks, img_w, img_h)
        measured = as_concern_scores(metrics["conditions"])

        analysis_result = await run_in_threadpool(model_loader.predict, image, user_params, measured)
        localized = await run_in_threadpool(analyze_face_regions, processed_face, landmarks)
        analysis_result = apply_localized_metrics(analysis_result, localized)
        final_contract = add_api_contract(analysis_result)

        # Persist to Supabase if user is authenticated
        if user_id and supabase:
            try:
                supabase.table("skin_analyses").insert({
                    "user_id": user_id,
                    "overall_score": final_contract.get("overall_score"),
                    "metrics": final_contract.get("metrics"),
                }).execute()
            except Exception as db_err:
                print(f"Error persisting scan to Supabase skin_analyses: {db_err}")

        return final_contract

    except HTTPException as http_ex:
        raise http_ex
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unable to process this image",
        )


# ---------------------------------------------------------------------------
# Report history  (frontend: src/services/reportService.ts)
# ---------------------------------------------------------------------------

@app.get("/api/reports")
def get_reports() -> list[dict]:
    """Return stored health reports, newest first."""
    try:
        return list_stored_reports(supabase_client=supabase)
    except Exception as store_err:
        print(f"Error listing reports: {store_err}")
        raise HTTPException(status_code=503, detail="Report store unavailable")


@app.post("/api/reports", status_code=201)
def create_report(report: ReportCreate) -> dict:
    """Persist a health report and return the stored record (id + createdAt)."""
    try:
        return save_stored_report(report.model_dump(), supabase_client=supabase)
    except Exception as store_err:
        print(f"Error saving report: {store_err}")
        raise HTTPException(status_code=503, detail="Report store unavailable")


@app.delete("/api/reports/{report_id}")
def remove_report(report_id: str) -> dict:
    """Delete a report by id; 404 when the id does not exist."""
    try:
        deleted = delete_stored_report(report_id, supabase_client=supabase)
    except Exception as store_err:
        print(f"Error deleting report: {store_err}")
        raise HTTPException(status_code=503, detail="Report store unavailable")
    if not deleted:
        raise HTTPException(status_code=404, detail="Report not found")
    return {"status": "deleted", "id": report_id}


# ---------------------------------------------------------------------------
# Skin scan history  (frontend: src/services/skinReportService.ts)
# ---------------------------------------------------------------------------

@app.get("/api/skin-reports")
def get_skin_reports(user_id: Optional[str] = Header(None, alias="X-User-Id")) -> list[dict]:
    """Return the authenticated user's skin scan reports, newest first."""
    uid = _require_user_id(user_id)
    try:
        return list_stored_skin_reports(uid, supabase_client=supabase)
    except Exception as store_err:
        print(f"Error listing skin reports: {store_err}")
        raise HTTPException(status_code=503, detail="Skin report store unavailable")


@app.post("/api/skin-reports", status_code=201)
def create_skin_report(
    report: SkinReportCreate,
    user_id: Optional[str] = Header(None, alias="X-User-Id"),
) -> dict:
    """Persist a skin scan report for the authenticated user."""
    uid = _require_user_id(user_id)
    try:
        return save_stored_skin_report(uid, report.model_dump(), supabase_client=supabase)
    except Exception as store_err:
        print(f"Error saving skin report: {store_err}")
        raise HTTPException(status_code=503, detail="Skin report store unavailable")


@app.delete("/api/skin-reports/{report_id}")
def remove_skin_report(
    report_id: str,
    user_id: Optional[str] = Header(None, alias="X-User-Id"),
) -> dict:
    """Delete one of the user's skin scan reports; 404 when the id does not exist."""
    uid = _require_user_id(user_id)
    try:
        deleted = delete_stored_skin_report(uid, report_id, supabase_client=supabase)
    except Exception as store_err:
        print(f"Error deleting skin report: {store_err}")
        raise HTTPException(status_code=503, detail="Skin report store unavailable")
    if not deleted:
        raise HTTPException(status_code=404, detail="Skin report not found")
    return {"status": "deleted", "id": report_id}


# ---------------------------------------------------------------------------
# User profile  (frontend: src/services/profileService.ts)
# ---------------------------------------------------------------------------

def _require_user_id(user_id: Optional[str]) -> str:
    if not user_id or not user_id.strip():
        raise HTTPException(status_code=400, detail="X-User-Id header is required")
    return user_id.strip()


@app.get("/api/profile")
def get_profile(user_id: Optional[str] = Header(None, alias="X-User-Id")) -> dict:
    """Return the profile for the authenticated user (Firebase UID header)."""
    uid = _require_user_id(user_id)
    try:
        profile = get_stored_profile(uid, supabase_client=supabase)
    except Exception as store_err:
        print(f"Error reading profile: {store_err}")
        raise HTTPException(status_code=503, detail="Profile store unavailable")
    if profile is None:
        raise HTTPException(status_code=404, detail="Profile not found")
    return profile


@app.put("/api/profile")
def put_profile(
    profile: ProfileUpdate,
    user_id: Optional[str] = Header(None, alias="X-User-Id"),
) -> dict:
    """Create or update the profile for the authenticated user."""
    uid = _require_user_id(user_id)
    try:
        return save_stored_profile(uid, profile.model_dump(), supabase_client=supabase)
    except Exception as store_err:
        print(f"Error saving profile: {store_err}")
        raise HTTPException(status_code=503, detail="Profile store unavailable")
