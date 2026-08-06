# Model weights go here.

Place your trained skin_model.pth file in this directory.

Full workflow (train -> evaluate -> calibrate -> validate):

1. Train with:      python train.py --dataset ./dataset --epochs 30
   (run python generate_mock_weights.py ONLY to smoke-test the pipeline;
    mock weights produce random, untrusted results).

2. Evaluate with:   python eval.py --dataset ./dataset --weights weights/skin_model.pth \
                        --thresholds eval_thresholds.example.json --output eval_results.json
   eval.py reports per-condition AUROC (label present at severity > 5/10) and MAE
   (0-10 scale), plus a per-Fitzpatrick-tone breakdown. Exit code 0 = every
   condition passed its thresholds; 1 = a metric missed (the current checked-in
   weights fail all thresholds: ~0.5 AUROC / ~2.9 MAE, i.e. they are NOT validated).
   Copy eval_thresholds.example.json to eval_thresholds.json and tune limits to
   your target skin-tone coverage. This is the gate that must pass before
   MODEL_VALIDATED is set to true.

3. Calibrate with: python calibrate.py --dataset ./dataset --weights weights/skin_model.pth \
                        --output calibration.json
   Fits per-condition Platt scaling (p = sigmoid(a*z + b)) so probabilities (and
   analysisConfidence) are honest, not inflated. calibration.json is loaded
   automatically by SkinModelLoader at inference time when present next to the
   weights file. Re-run calibrate.py on a holdout split after every retrain.

4. Record the SHA-256 of the weights file and set it as MODEL_SHA256 in the
   deployment environment. Verify it matches the value returned by /health.

5. Set MODEL_VERSION to the model version label (e.g. v1.0.0).

6. ONLY THEN set MODEL_VALIDATED=true in the production environment. Without it,
   /analyze-skin returns 503 because development/mock weights must never be
   presented as validated production analysis.
