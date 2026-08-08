import { auth } from "../firebase";
import type { SkinAnalysisResult } from "../utils/skinEngine";
import type { SkinRecommendations } from "../utils/skinRecommendations";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:8080";

export type SkinReportInput = {
  skin_type: string;
  acne_level: number;
  dark_circles: number;
  oiliness: number;
  dryness: number;
  redness: number;
  pore_visibility: number;
  pigmentation: number;
  texture: number;
  glow_score: number;
  hydration: number;
  overall_score: number;
  recommendations?: SkinRecommendations;
};

export type StoredSkinReport = SkinReportInput & {
  id: string;
  user_id: string;
  created_at: string;
};

function userIdHeader(): Record<string, string> {
  const uid = auth.currentUser?.uid;
  return uid ? { "X-User-Id": uid } : {};
}

export function skinResultToReport(
  result: SkinAnalysisResult,
  recommendations?: SkinRecommendations
): SkinReportInput {
  return {
    skin_type: result.skinType,
    acne_level: result.acneLevel,
    dark_circles: result.darkCircles,
    oiliness: result.oiliness,
    dryness: result.dryness,
    redness: result.redness,
    pore_visibility: result.poreVisibility,
    pigmentation: result.pigmentation,
    texture: result.texture,
    glow_score: result.glowScore,
    hydration: result.hydration,
    overall_score: result.overallScore,
    recommendations,
  };
}

export async function saveSkinReport(report: SkinReportInput) {
  try {
    const res = await fetch(`${BACKEND_URL}/api/skin-reports`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...userIdHeader(),
      },
      body: JSON.stringify(report),
    });
    if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
    const data = await res.json();
    return { data: data as StoredSkinReport, error: null };
  } catch (err) {
    console.warn("Could not save skin report to backend:", err);
    return { data: null, error: err as Error };
  }
}

export async function getSkinReports() {
  try {
    const res = await fetch(`${BACKEND_URL}/api/skin-reports`, {
      headers: userIdHeader(),
    });
    if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
    const data = await res.json();
    return { data: data as StoredSkinReport[], error: null };
  } catch (err) {
    console.warn("Could not fetch skin reports from backend:", err);
    return { data: [] as StoredSkinReport[], error: err as Error };
  }
}

export async function deleteSkinReport(id: string | number) {
  try {
    const res = await fetch(`${BACKEND_URL}/api/skin-reports/${id}`, {
      method: "DELETE",
      headers: userIdHeader(),
    });
    if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
    return { data: null, error: null };
  } catch (err) {
    console.warn("Could not delete skin report from backend:", err);
    return { data: null, error: err as Error };
  }
}
