# Model weights go here.

Current `skin_model.pth` = MobileNetV2 distilled from the CV skin-metrics heuristics
(`app/services/skin_metrics.py`) using `generate_synthetic_dataset.py`. It is the
first checked-in weights file that is NOT random.

## Validated status (synthetic distillation — read carefully)

Evaluated on 150 fully-synthetic held-out faces (generated with `--seed 777`, never
seen in training or calibration):

  mean MAE  : 0.60 on the 0-10 scale   (was 2.94 for the old mock weights)
  mean AUROC: 0.974                    (was 0.51)
  thresholds: 19/20 conditions PASS the example gate
              (puffiness: MAE 1.51 vs 1.5 limit — borderline; AUROC 0.94 strong)

Calibration (`calibration.json`, fit on a separate 200-image split) sharpens
presence/absence confidence but is NOT a regression transform — applying it makes
regression MAE worse while AUROC stays ~0.97. Treat the uncalibrated sigmoid as the
severity estimate and the calibrated value as the "present at severity > 5/10"
confidence.

### IMPORTANT HONESTY NOTE
This validates the *distillation*: the neural model replicates the deterministic CV
heuristics on synthetic faces. It is NOT dermatological validation. The labels come
from the same heuristics that produced the reference scores, and the "faces" are
procedurally generated. A real, human-labelled face dataset (e.g. FFHQ + ISIC/ACNE04)
is still required before `MODEL_VALIDATED=true` should be considered for production.
Do not present the 19/20 figure as medical accuracy.

## Real-face robustness check (Phase A, `validate_real.py`)

A small real-photo corpus (17 sample faces from dlib / OpenCV / face_recognition,
fetched by `download_real_faces.py`, images gitignored) runs the FULL production
pipeline end-to-end: decode -> face crop -> CLAHE -> bilateral -> FaceMesh ->
zone-masked CV metrics -> distilled model. See `real_eval_result.json` for the raw
output. Findings (run with the committed weights):

  detection   : 16/17 faces produced FaceMesh landmarks on the crop (messi5.jpg
                failed; no landmarks on crop or full frame)
  robustness  : 100% of outputs finite and within [0, 10] across base + brightness
                +-15% + JPEG q40 re-encodes; worst per-condition model stability
                mean |delta| ~0.59/10
  agreement   : model-vs-CV-reference mean MAE 3.56 / mean AUROC 0.61 (0-10 scale)

### Why the real-face agreement looks bad, and why that is expected
The CV metric clamp ranges (`skin_metrics._clamp_min_max`) were fit to smooth
synthetic renders, where baseline signals start near zero. Real photographs carry
natural texture, edges and lighting gradients that push many raw signals past their
max, so the CV reference PEGS at 10: acneLevel, darkCircles, poreVisibility,
texture, blackheads, aging and puffiness all saturate on >=50% of the corpus
(see `cv_saturation_pct` in the JSON). Where the reference is a constant 10, the
model-vs-CV MAE measures nothing about real skin — it only confirms the model
tracks the saturated direction (puffiness: CV=10 constant, model 7.7-9.8, MAE 0.75).
The synthetic distillation eval remains the release gate; real dermatological
labelling is still required before production claims.

### Tone coverage of this corpus
Mean face-crop L* bins: 4 dark (<120), 11 medium (120-160), 1 light (>160). The
corpus skews medium-light and is too small to validate any per-tone behaviour.

## Full workflow (train -> evaluate -> calibrate -> validate)

1. Train with:      python train.py --dataset ./dist_dataset --epochs 25
   (or on a real labelled dataset). `--no-pretrained` skips the ImageNet download.

2. Generate a held-out evaluation set the model never saw:
   python generate_synthetic_dataset.py --count 150 --output-dir dist_eval2 --seed 777

3. Evaluate with:   python eval.py --dataset dist_eval2 --weights weights/skin_model.pth \
                        --thresholds eval_thresholds.example.json --output eval_results.json
   eval.py reports per-condition AUROC (label present at severity > 5/10) and MAE
   (0-10 scale), plus a per-Fitzpatrick-tone breakdown. Exit code 0 = every
   condition passed its thresholds; 1 = a metric missed.
   Copy eval_thresholds.example.json to eval_thresholds.json and tune limits to your
   target skin-tone coverage. This is the gate that must pass before MODEL_VALIDATED
   is set to true.

4. Calibrate with: python calibrate.py --dataset <holdout> --weights weights/skin_model.pth \
                        --output calibration.json
   Fits per-condition Platt scaling (p = sigmoid(a*z + b)) so probabilities (and
   analysisConfidence) are honest, not inflated. calibration.json is loaded
   automatically by SkinModelLoader at inference time when present next to the
   weights file. Re-run calibrate.py on a holdout split after every retrain.

5. Record the SHA-256 of the weights file and set it as MODEL_SHA256 in the
   deployment environment. Verify it matches the value returned by /health.

6. Set MODEL_VERSION to the model version label (e.g. v1.0.0).

7. ONLY THEN set MODEL_VALIDATED=true in the production environment. Without it,
   /analyze-skin returns 503 because unvalidated weights must never be presented
   as validated production analysis.
