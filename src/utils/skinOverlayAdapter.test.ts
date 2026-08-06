import { describe, expect, it } from "vitest";
import { convertToOverlayData } from "./skinOverlayAdapter";
import type { SkinAnalysisResult } from "./skinEngine";

function baseResult(overrides: Partial<SkinAnalysisResult> = {}): SkinAnalysisResult {
  return {
    skinType: "Normal",
    acneLevel: 0,
    darkCircles: 0,
    oiliness: 0,
    dryness: 0,
    redness: 0,
    poreVisibility: 0,
    pigmentation: 0,
    texture: 0,
    glowScore: 5,
    hydration: 5,
    overallScore: 8,
    blackheads: 0,
    melasma: 0,
    tanning: 0,
    dullness: 0,
    acneScars: 0,
    aging: 0,
    puffiness: 0,
    dehydration: 0,
    milia: 0,
    sunburn: 0,
    analysisConfidence: 80,
    detectedConcerns: [],
    timestamp: 1,
    ...overrides,
  };
}

describe("convertToOverlayData", () => {
  it("emits no callouts when nothing was detected", () => {
    const { issues } = convertToOverlayData(baseResult());
    expect(issues).toEqual([]);
  });

  it("emits an acne callout when the score clears the threshold", () => {
    const { issues } = convertToOverlayData(baseResult({ acneLevel: 6 }));
    const acne = issues.find((issue) => issue.label === "Acne");
    expect(acne).toBeDefined();
    expect(acne?.severity).toBe("Moderate");
    expect(acne?.confidence).toBe(0.8);
  });

  it("does not emit an acne callout below the threshold", () => {
    const { issues } = convertToOverlayData(baseResult({ acneLevel: 2 }));
    expect(issues.find((issue) => issue.label === "Acne")).toBeUndefined();
  });

  it("emits a callout when the concern is in detectedConcerns even if the score is low", () => {
    const { issues } = convertToOverlayData(
      baseResult({ acneLevel: 1, detectedConcerns: ["Acne & Breakouts"] })
    );
    expect(issues.find((issue) => issue.label === "Acne")).toBeDefined();
  });

  it("anchors the dark-circle callout to the bounding-region centre when present", () => {
    const result = baseResult({
      darkCircles: 7,
      localized_analysis: {
        primary_skin_type: "Normal",
        metrics: {},
        bounding_regions: { dark_circles: { x: 0.1, y: 0.2, w: 0.4, h: 0.2 } },
      },
    });
    const { issues } = convertToOverlayData(result);
    const dc = issues.find((issue) => issue.label === "Dark Circles");
    expect(dc?.location.x).toBeCloseTo(0.3);
    expect(dc?.location.y).toBeCloseTo(0.3);
    expect(dc?.severity).toBe("Severe");
  });

  it("sorts callouts by severity so Severe lands first", () => {
    const { issues } = convertToOverlayData(
      baseResult({ acneLevel: 8, darkCircles: 3, redness: 9 })
    );
    expect(issues.length).toBeGreaterThanOrEqual(2);
    expect(issues[0].severity).toBe("Severe");
  });

  it("returns an empty mesh point list", () => {
    const { meshPoints } = convertToOverlayData(baseResult());
    expect(meshPoints).toEqual([]);
  });
});
