# Model weights go here.

Place your trained skin_model.pth file in this directory.

Before trusting the deployed API:

1. Train with: python train.py --dataset ./dataset --epochs 30
   (run python generate_mock_weights.py ONLY to smoke-test the pipeline;
    mock weights produce random, untrusted results).
2. Run the evaluation harness (eval.py) and confirm it passes the per-condition
   AUROC/MAE thresholds for your target skin-tone coverage.
3. Record the SHA-256 of the weights file and set it as MODEL_SHA256 in the
   deployment environment. Verify it matches the value returned by /health.
4. Set MODEL_VERSION to the model version label (e.g. v1.0.0).
5. ONLY THEN set MODEL_VALIDATED=true in the production environment. Without it,
   /analyze-skin returns 503 because development/mock weights must never be
   presented as validated production analysis.
