import { supabase } from "../supabase";
import type { SkinAnalysisResult } from "../utils/skinEngine";
import type { SkinRecommendations } from "../utils/skinRecommendations";

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
    return await supabase.from("skin_reports").insert([report]);
  } catch (err) {
    console.warn("Could not save skin report to Supabase:", err);
    return { data: null, error: err as Error };
  }
}

export async function getSkinReports() {
  try {
    return await supabase
      .from("skin_reports")
      .select("*")
      .order("created_at", { ascending: false });
  } catch (err) {
    console.warn("Could not fetch skin reports:", err);
    return { data: [], error: err as Error };
  }
}

export async function deleteSkinReport(id: string | number) {
  try {
    return await supabase.from("skin_reports").delete().eq("id", id);
  } catch (err) {
    console.warn("Could not delete skin report:", err);
    return { data: null, error: err as Error };
  }
}
