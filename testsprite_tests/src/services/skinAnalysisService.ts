import { detectFaceBoundingBox, analyzeSkinFromFrame } from "../utils/skinEngine";
import type { SkinAnalysisResult } from "../utils/skinEngine";

const ML_BACKEND_URL = import.meta.env.VITE_ML_BACKEND_URL || "http://localhost:8000";

/**
 * Utility to convert canvas to Blob (JPEG) wrapped in a Promise.
 */
function getCanvasBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), "image/jpeg", 0.9);
  });
}

/**
 * Crops the face from the source canvas using the heuristic bounding box,
 * converts the crop to a Blob, and sends it to the FastAPI backend.
 * Falls back to local pixel-heuristic analysis if the server is offline or fails.
 */
export async function analyzeSkinOnServer(
  canvas: HTMLCanvasElement,
  video: HTMLVideoElement,
  userAge: number,
  userSleepHours: number,
  userWaterIntake: number,
  userStress: number,
  userConcern: string
): Promise<SkinAnalysisResult> {
  try {
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Could not acquire canvas 2D context");
    }

    const width = canvas.width;
    const height = canvas.height;

    // 1. Get image data to run face detector
    const imageData = ctx.getImageData(0, 0, width, height);
    const faceBox = detectFaceBoundingBox(imageData.data, width, height);

    // 2. Crop the face area using an offscreen canvas
    const cropCanvas = document.createElement("canvas");
    const cropW = faceBox.x1 - faceBox.x0;
    const cropH = faceBox.y1 - faceBox.y0;

    cropCanvas.width = cropW;
    cropCanvas.height = cropH;

    const cropCtx = cropCanvas.getContext("2d");
    if (!cropCtx) {
      throw new Error("Could not acquire crop canvas 2D context");
    }

    // Draw the cropped portion from the main canvas
    cropCtx.drawImage(
      canvas,
      faceBox.x0, faceBox.y0, cropW, cropH, // Source rect
      0, 0, cropW, cropH                   // Dest rect
    );

    // 3. Convert crop to Blob
    const imageBlob = await getCanvasBlob(cropCanvas);
    if (!imageBlob) {
      throw new Error("Failed to export crop canvas to blob");
    }

    // 4. Send image and parameters using FormData
    const formData = new FormData();
    formData.append("file", imageBlob, "cropped_face.jpg");
    formData.append("age", userAge.toString());
    formData.append("sleepHours", userSleepHours.toString());
    formData.append("waterIntake", userWaterIntake.toString());
    formData.append("stressLevel", userStress.toString());
    formData.append("skinConcern", userConcern);

    console.log(`Sending cropped face image (${cropW}x${cropH}) to FastAPI backend at: ${ML_BACKEND_URL}`);
    
    const response = await fetch(`${ML_BACKEND_URL}/analyze-skin`, {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Server returned error: ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    console.log("Successfully received skin analysis from ML server:", result);
    return result as SkinAnalysisResult;

  } catch (error) {
    console.warn("ML backend skin analysis failed or is offline. Falling back to local pixel heuristics.", error);
    
    // Local fallback
    return analyzeSkinFromFrame(
      canvas,
      video,
      userAge,
      userSleepHours,
      userWaterIntake,
      userStress,
      userConcern
    );
  }
}
