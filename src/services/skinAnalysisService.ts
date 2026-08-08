import { analyzeSkinFromFrame } from "../utils/skinEngine";
import type { SkinAnalysisResult } from "../utils/skinEngine";
import { supabase } from "../supabase";

const DEFAULT_PRODUCTION_URL = "https://vitalscan-api-y891.onrender.com";

function isLocalhostUrl(url: string): boolean {
  return /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(:\d+)?$/i.test(url);
}

function resolveBackendUrl(): string | null {
  const configured = import.meta.env.VITE_ML_BACKEND_URL?.replace(/\/$/, "");
  if (!configured) return null;
  // A localhost backend is never valid in a deployed build. Point deployed
  // clients at the production HTTPS origin instead of the user's machine.
  if (import.meta.env.PROD && isLocalhostUrl(configured)) {
    return DEFAULT_PRODUCTION_URL;
  }
  return configured;
}

const ML_BACKEND_URL = resolveBackendUrl();

// Browser-side estimates must never silently replace a failed production analysis.
const ALLOW_LOCAL_FALLBACK =
  !import.meta.env.PROD && import.meta.env.VITE_ALLOW_LOCAL_ANALYSIS_FALLBACK === "true";

/**
 * Utility to convert canvas to Blob (JPEG) wrapped in a Promise.
 */
function getCanvasBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), "image/jpeg", 0.9);
  });
}

async function getApiError(response: Response): Promise<string> {
  try {
    const body = await response.json() as { detail?: string };
    if (body.detail) return body.detail;
  } catch {
    // Some infrastructure errors are not JSON; use the status message below.
  }
  return `The analysis service could not process this image (${response.status}).`;
}

/**
 * Captures the current camera frame and sends it to the API. The server is the
 * source of truth for face detection and preprocessing, avoiding a second,
 * heuristic client-side crop that could exclude relevant skin regions.
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
  if (!ML_BACKEND_URL) {
    throw new Error("Skin analysis is not configured. Set VITE_ML_BACKEND_URL to the HTTPS API URL.");
  }

  try {
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Could not acquire canvas 2D context");
    }

    if (!video.videoWidth || !video.videoHeight) {
      throw new Error("Camera frame is not ready. Please try again.");
    }

    // Capture immediately before upload rather than relying on an older frame
    // from the quality-check interval.
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.save();
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    ctx.restore();

    const imageBlob = await getCanvasBlob(canvas);
    if (!imageBlob) {
      throw new Error("Failed to export camera frame to an image");
    }

    const formData = new FormData();
    formData.append("file", imageBlob, "skin-capture.jpg");
    formData.append("age", userAge.toString());
    formData.append("sleepHours", userSleepHours.toString());
    formData.append("waterIntake", userWaterIntake.toString());
    formData.append("stressLevel", userStress.toString());
    formData.append("skinConcern", userConcern);

    const headers: Record<string, string> = {};
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user?.id) {
        headers["X-User-Id"] = user.id;
      }
    } catch {
      // User context optional
    }

    const response = await fetch(`${ML_BACKEND_URL}/analyze-skin`, {
      method: "POST",
      headers,
      body: formData,
    });

    if (!response.ok) {
      throw new Error(await getApiError(response));
    }

    const result = await response.json() as SkinAnalysisResult;
    if (!Number.isFinite(result.analysisConfidence) || !Number.isFinite(result.overallScore)) {
      throw new Error("The analysis service returned an invalid result.");
    }
    return result as SkinAnalysisResult;

  } catch (error) {
    // A local estimate can be useful during deliberate offline development, but
    // must never silently replace a failed production analysis.
    if (ALLOW_LOCAL_FALLBACK) {
      console.warn("ML backend unavailable; using explicitly enabled local development fallback.", error);
      return analyzeSkinFromFrame(canvas, video, userAge, userSleepHours, userWaterIntake, userStress, userConcern);
    }
    throw error instanceof Error ? error : new Error("Unable to complete skin analysis.");
  }
}
