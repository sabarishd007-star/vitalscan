import type { SkinAnalysisResult } from "./skinEngine";
import type { DetectedIssue, Coordinate } from "../components/SkinAnalysisOverlay";

/**
 * Converts a SkinAnalysisResult into honest DetectedIssue[] callouts for
 * SkinAnalysisOverlay.
 *
 * Every callout is driven by the actual measured score or the detected-concern
 * list. A concern only produces a callout when it clears its detection
 * threshold, its severity and confidence come from the real result, and the
 * anchor location prefers the server-provided bounding region. No callout is
 * fabricated when nothing was detected.
 */
export function convertToOverlayData(result: SkinAnalysisResult): {
  issues: DetectedIssue[];
  meshPoints: Coordinate[];
} {
  const regions = result.localized_analysis?.bounding_regions;
  const confidence = Math.min(1, Math.max(0, (result.analysisConfidence || 0) / 100));
  const issues: DetectedIssue[] = [];
  const detected = new Set(result.detectedConcerns ?? []);

  const addIssue = (
    id: string,
    label: string,
    score: number,
    threshold: number,
    detectedLabel: string,
    landmarkIndex: number,
    location: Coordinate,
    labelOffset: { dx: number; dy: number }
  ) => {
    if (score < threshold && !detected.has(detectedLabel)) return;
    issues.push({
      id,
      label,
      severity: score >= 7 ? "Severe" : score >= 5 ? "Moderate" : "Low",
      confidence: Math.round(confidence * 100) / 100,
      location,
      landmarkIndex,
      labelOffset,
    });
  };

  const regionCenter = (key: string, fallback: Coordinate): Coordinate => {
    const region = regions?.[key];
    if (!region) return fallback;
    return { x: region.x + region.w / 2, y: region.y + region.h / 2 };
  };

  addIssue(
    "pimple-spot",
    "Acne",
    result.acneLevel ?? 0,
    4.5,
    "Acne & Breakouts",
    25,
    regionCenter("redness", { x: 0.38, y: 0.48 }),
    { dx: -18, dy: 4 }
  );

  addIssue(
    "dark-circle",
    "Dark Circles",
    result.darkCircles ?? 0,
    5.0,
    "Dark Circles",
    18,
    regionCenter("dark_circles", { x: 0.59, y: 0.38 }),
    { dx: 16, dy: 12 }
  );

  addIssue(
    "open-pores",
    "Enlarged Pores",
    result.poreVisibility ?? 0,
    5.5,
    "Enlarged Pores",
    27,
    regionCenter("open_pores", { x: 0.62, y: 0.48 }),
    { dx: 16, dy: 4 }
  );

  addIssue(
    "redness",
    "Redness",
    result.redness ?? 0,
    5.0,
    "Sensitive / Redness",
    25,
    regionCenter("redness", { x: 0.38, y: 0.45 }),
    { dx: -18, dy: 12 }
  );

  addIssue(
    "oiliness",
    "Oiliness",
    result.oiliness ?? 0,
    6.0,
    "Oily / Shiny Skin",
    21,
    regionCenter("oiliness", { x: 0.5, y: 0.48 }),
    { dx: 0, dy: -14 }
  );

  addIssue(
    "dryness",
    "Dryness",
    result.dryness ?? 0,
    6.0,
    "Dry / Flaky Skin",
    25,
    regionCenter("dryness", { x: 0.38, y: 0.52 }),
    { dx: -18, dy: -10 }
  );

  const severityRank = { Severe: 3, Moderate: 2, Low: 1 };
  issues.sort((a, b) => severityRank[b.severity] - severityRank[a.severity]);
  return { issues, meshPoints: [] };
}
