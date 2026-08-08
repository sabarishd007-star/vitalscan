# VitalScan AI Skin Analysis — ML Backend

This is the Python/FastAPI service for cosmetic skin-analysis estimates. It detects and crops a face server-side, normalizes luminance in CIE LAB, then runs the inference model.

> This is not a medical device or diagnostic tool. Do not represent heuristic or unvalidated model output as a clinical result.

---

## 📁 Project Structure

```
ml-backend/
├── main.py                    # FastAPI app & /analyze-skin endpoint
├── model.py                   # SkinAnalysisModel + heuristic fallback
├── train.py                   # Full model training script
├── generate_mock_weights.py   # Creates random weights for pipeline testing
├── requirements.txt           # Python dependencies
└── weights/
    └── skin_model.pth         # ← Place trained weights here
```

---

## 🚀 Quick Start

### Step 1 — Setup Virtual Environment

```powershell
cd ml-backend
python -m venv venv
.\venv\Scripts\activate
pip install -r requirements.txt
```

### Step 2 — Start the Server

```powershell
.\venv\Scripts\uvicorn main:app --port 8000 --reload
```

Visit **http://localhost:8000** to confirm it's running. The server starts in **Heuristic Mock mode** until trained weights are present.

---

## 🔬 API Endpoints

### `GET /`
Returns server status and current running mode.

```json
{
  "status": "online",
  "service": "VitalScan AI Skin API",
  "engine": "PyTorch + Heuristic Fallback",
  "mode": "Heuristic Mock"
}
```

### `GET /health`
Use this endpoint for container and platform health checks. It does not run inference.

```json
{
  "status": "healthy",
  "device": "cpu",
  "model_mode": "loaded",
  "production_model_validated": false
}
```

### `POST /analyze-skin`
Accepts a camera image (JPEG, PNG, or WebP; maximum 10 MB), then detects and crops the face on the server. The API returns legacy UI scores (0–10) as well as a stable, user-facing `metrics` contract (0–100).

**Form parameters:**
| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `file` | image file | required | JPEG/PNG cropped face |
| `age` | int | 25 | User age |
| `sleepHours` | float | 7.0 | Sleep hours per night |
| `waterIntake` | float | 2.5 | Water in litres/day |
| `stressLevel` | int | 4 | Stress 1–10 |
| `skinConcern` | string | none | Selected skin concern key |

**Response:**
```json
{
  "skinType": "Oily",
  "overallScore": 6.4,
  "analysisConfidence": 85,
  "detectedConcerns": ["Acne & Breakouts", "Enlarged Pores"],
  "acneLevel": 7.2,
  "oiliness": 8.1,
  "hydration": 4.5,
  "overall_score": 64,
  "metrics": {
    "redness": { "score": 15, "status": "Low", "description": "Visible redness or irritation estimate." },
    "pores": { "score": 42, "status": "Moderate", "description": "Appearance of pore visibility, mainly in the T-zone." },
    "texture": { "score": 25, "status": "Low", "description": "Surface texture and visible roughness estimate." },
    "blemishes": { "score": 10, "status": "Low", "description": "Visible blemish and breakout estimate." }
  },
  "disclaimer": "This analysis is for informational cosmetic care only and does not constitute a clinical medical diagnosis...",
  ...
}
```

### `POST /api/v2/analyze-all-conditions`
Accepts the same image upload as `/analyze-skin` but requires no ML weights. Runs the zone-masked CV metric pipeline (`app/services/skin_metrics.py`) and returns all 18 condition scores on the 0–10 scale.

### Report history — `POST/GET/DELETE /api/reports`
The scan report history used by the frontend (`src/services/reportService.ts`).

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/reports` | List stored reports, newest first |
| `POST` | `/api/reports` | Save a report; returns the record with `id` + `createdAt` (201) |
| `DELETE` | `/api/reports/{id}` | Delete a report (404 when the id does not exist) |

Storage (`app/services/report_store.py`): a local JSON store at `ml-backend/data/reports.json` by default (gitignored; zero-config dev fallback), or a Supabase `report_history` table when `SUPABASE_URL`/`SUPABASE_KEY` are configured. Store failures return 503.

**`POST /api/reports` payload (camelCase, as sent by the frontend):**
```json
{
  "heartRate": 72,
  "bloodPressure": "118/76",
  "oxygenLevel": 97,
  "respirationRate": null,
  "healthScore": 84,
  "riskLevel": "Low",
  "stressLevel": "Low"
}
```

---

### User profile — `GET/PUT /api/profile`
The signed-in user's profile used by the frontend (`src/services/profileService.ts`). Both endpoints require the Firebase UID in the `X-User-Id` header (400 when missing). `GET` returns 404 when no profile exists yet.

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/profile` | Return the profile for the `X-User-Id` user (404 when absent) |
| `PUT` | `/api/profile` | Create or update the profile; returns the stored document |

Storage (`app/services/profile_store.py`): a local JSON store at `ml-backend/data/profiles.json` by default (gitignored), or a Supabase `profiles` table (upsert on `user_id`) when configured. The profile body is a single JSON document (`profile` jsonb column), so the field set can evolve without schema churn. Create the table with `supabase/migrations/0001_create_profiles_table.sql`.

**`PUT /api/profile` payload (camelCase):**
```json
{
  "displayName": "Ada Lovelace",
  "dateOfBirth": "1990-04-01",
  "sex": "female",
  "heightCm": 168,
  "weightKg": 60,
  "activityLevel": "moderate",
  "conditions": ["asthma"],
  "medications": ["ventolin"],
  "allergies": ["penicillin"],
  "emergencyContacts": [{"name": "Grace Hopper", "relationship": "Partner", "phone": "555-0100"}],
  "healthTargets": ["better sleep"],
  "notificationRules": {"email": true, "sms": false, "push": true},
  "reportOptions": {"anonymize": true}
}
```
Unknown fields are ignored; `heightCm`/`weightKg` are range-checked (422 on invalid).

---

## 🧠 Running Modes

| Mode | Condition | Description |
|------|-----------|-------------|
| **Heuristic Mock** | No weights file | Uses PIL color analysis + lifestyle adjustments |
| **Real ML Mode** | `weights/skin_model.pth` present | Full PyTorch MobileNetV2 inference |

### Test the full ML pipeline without real data

Run the mock weights generator only to verify that the inference pipeline executes:

```powershell
python generate_mock_weights.py
```

Then restart uvicorn. The resulting outputs are random and are unsuitable for users or evaluation of accuracy.

---

## 🏋️ Training with Real Data

### Dataset Format

```
dataset/
├── images/
│   ├── img_001.jpg
│   └── ...
└── labels.csv
```

`labels.csv` must have columns: `filename`, then one column per concern (values 0.0–1.0):
```
filename,acneLevel,darkCircles,oiliness,dryness,...
img_001.jpg,0.7,0.3,0.6,0.2,...
```

### Run Training

```powershell
python train.py --dataset ./dataset --epochs 30 --batch_size 16
```

Best weights are automatically saved to `weights/skin_model.pth`.

### Recommended Public Datasets
- **ISIC Archive** — skin lesion images: https://www.isic-archive.com
- **ACNE04 Dataset** — acne grading: https://github.com/xpwu95/LDL
- **FFHQ** — high-quality face images: https://github.com/NVlabs/ffhq-dataset

---

## 🌐 Frontend Integration

The React frontend sends the full, freshly captured camera frame to this API via `skinAnalysisService.ts`. The backend is the source of truth for face detection and preprocessing. A backend failure is shown to the user; a local fallback is available only when `VITE_ALLOW_LOCAL_ANALYSIS_FALLBACK=true` is intentionally set for development.

Set the backend URL via environment variable in the React project:
```
VITE_ML_BACKEND_URL=http://localhost:8000
```

## Production configuration

Set the following only in the API host's environment dashboard (never a committed file):

```env
APP_ENV=production
ALLOWED_ORIGINS=https://app.yourdomain.com
MODEL_VALIDATED=false
```

`ALLOWED_ORIGINS` must list exact frontend origins separated by commas. Wildcards are intentionally not permitted in production.
The API refuses inference in production until `MODEL_VALIDATED=true` is deliberately set. Set it only after replacing the generated mock weights with a documented, independently validated model.

## Docker deployment

Build and run the service from this directory:

```bash
docker build -t vitalscan-skin-api .
docker run --rm -p 8001:8001 --env-file .env vitalscan-skin-api
```

The included `Dockerfile` uses Python 3.10, installs the OpenCV runtime libraries, runs as a non-root user, and exposes `/health` for deployment monitoring. Hosting platforms may provide a `PORT` environment variable; the container honours it automatically.

---

## ⚠️ Model card & known limitations

| Area | Status |
|------|--------|
| Training data | Synthetic dataset generated by `generate_synthetic_dataset.py` from CV-heuristic labels — **not** clinical ground truth |
| Clinical validation | **Not performed.** No dermatologist-labelled dataset was used. `production_model_validated` is `false` in `/health` |
| Intended use | Cosmetic, informational skin-care estimates only. Not a medical device |
| rPPG vitals | Heart rate only. Blood pressure, SpO₂ and respiration are intentionally `null` (honesty change `b1b1744`) |
| Bias | No demographic-balance guarantees; results may be less reliable across skin tones, lighting, and devices |

Validation harness: `python eval.py` (golden-image regression), `python calibrate.py` (threshold calibration), `validate_real.py` (real-face robustness). None of these replace a clinical study.

**To move toward production:** replace the synthetic weights with a model trained on a licensed, clinician-labelled dataset (see Training section), re-run the eval harness, and only then set `MODEL_VALIDATED=true`.

---

## 🧭 Project status checklist

- [x] Auth (email + Google) with email verification and password reset
- [x] Skin analysis pipeline (face mesh, 18-condition metrics, distilled model)
- [x] rPPG heart rate with honest `null` vitals
- [x] Report history + user profiles persisted to Supabase
- [x] Test suites green (backend pytest, frontend vitest), lint + build clean
- [ ] Run `supabase/migrations/0001_create_profiles_table.sql` in the SQL Editor
- [ ] Replace synthetic weights with clinically-labelled trained model
- [ ] Independent clinical validation + set `MODEL_VALIDATED=true`
- [ ] Deploy API (Docker) and frontend (Vercel) with real env vars
- [ ] Test on real mobile devices

