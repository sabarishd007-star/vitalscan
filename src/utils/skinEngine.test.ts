import { describe, expect, it, vi } from "vitest";
import { analyzeSkinFromFrame } from "./skinEngine";
import type { SkinAnalysisResult } from "./skinEngine";

const W = 640;
const H = 480;

type FillFn = (data: Uint8ClampedArray, width: number, height: number) => void;

function makeCanvas(fill: FillFn) {
  const data = new Uint8ClampedArray(W * H * 4);
  fill(data, W, H);

  const ctx = {
    save: vi.fn(),
    translate: vi.fn(),
    scale: vi.fn(),
    drawImage: vi.fn(),
    restore: vi.fn(),
    putImageData: vi.fn(),
    getImageData: () => ({ data, width: W, height: H }),
  };

  const canvas = {
    width: W,
    height: H,
    getContext: () => ctx,
  };
  return { canvas: canvas as unknown as HTMLCanvasElement };
}

const video = { videoWidth: W, videoHeight: H } as unknown as HTMLVideoElement;

function fillSkin(data: Uint8ClampedArray, _width: number, _height: number): void {
  for (let i = 0; i < data.length; i += 4) {
    data[i] = 200;
    data[i + 1] = 150;
    data[i + 2] = 120;
    data[i + 3] = 255;
  }
}

function fillAcne(data: Uint8ClampedArray, width: number, height: number): void {
  fillSkin(data, width, height);
  const spots = [
    [320, 100], [330, 110], [310, 120], [350, 95], [340, 125],
    [180, 280], [190, 290], [460, 275], [470, 285],
  ];
  for (const [x, y] of spots) {
    for (let dy = 0; dy < 6; dy++) {
      for (let dx = 0; dx < 6; dx++) {
        const i = ((y + dy) * width + (x + dx)) * 4;
        data[i] = 200;
        data[i + 1] = 0;
        data[i + 2] = 0;
        data[i + 3] = 255;
      }
    }
  }
}

function fillShadow(data: Uint8ClampedArray, width: number, height: number): void {
  fillSkin(data, width, height);
  for (let y = 195; y < 225; y++) {
    for (let x = 215; x < 425; x++) {
      const i = (y * width + x) * 4;
      data[i] = 70;
      data[i + 1] = 50;
      data[i + 2] = 45;
      data[i + 3] = 255;
    }
  }
}

function sansTimestamp(result: SkinAnalysisResult): Omit<SkinAnalysisResult, "timestamp"> {
  const { timestamp, ...rest } = result;
  void timestamp;
  return rest;
}

describe("analyzeSkinFromFrame", () => {
  it("returns a complete, in-range result for a plain face", () => {
    const { canvas } = makeCanvas(fillSkin);
    const result = analyzeSkinFromFrame(canvas, video, 25, 7, 2.5, 4, "none");

    expect(result.overallScore).toBeGreaterThanOrEqual(1);
    expect(result.overallScore).toBeLessThanOrEqual(10);
    expect(result.analysisConfidence).toBeGreaterThanOrEqual(0);
    expect(result.analysisConfidence).toBeLessThanOrEqual(100);

    const metrics = [
      result.acneLevel, result.darkCircles, result.oiliness, result.dryness,
      result.redness, result.poreVisibility, result.pigmentation, result.texture,
      result.glowScore, result.hydration, result.blackheads, result.melasma,
      result.tanning, result.dullness, result.acneScars, result.aging,
      result.puffiness, result.dehydration, result.milia, result.sunburn,
    ];
    for (const value of metrics) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(10);
    }
  });

  it("is deterministic for identical input", () => {
    const first = analyzeSkinFromFrame(makeCanvas(fillSkin).canvas, video, 25, 7, 2.5, 4, "none");
    const second = analyzeSkinFromFrame(makeCanvas(fillSkin).canvas, video, 25, 7, 2.5, 4, "none");
    expect(sansTimestamp(first)).toEqual(sansTimestamp(second));
  });

  it("scores red blemishes higher on acne and redness", () => {
    const plain = analyzeSkinFromFrame(makeCanvas(fillSkin).canvas, video, 25, 7, 2.5, 4, "none");
    const acne = analyzeSkinFromFrame(makeCanvas(fillAcne).canvas, video, 25, 7, 2.5, 4, "none");

    expect(acne.acneLevel).toBeGreaterThan(plain.acneLevel);
    expect(acne.redness).toBeGreaterThanOrEqual(plain.redness);
  });

  it("scores a darkened under-eye band higher on dark circles", () => {
    const plain = analyzeSkinFromFrame(makeCanvas(fillSkin).canvas, video, 25, 7, 2.5, 4, "none");
    const shadowed = analyzeSkinFromFrame(makeCanvas(fillShadow).canvas, video, 25, 7, 2.5, 4, "none");

    expect(shadowed.darkCircles).toBeGreaterThan(plain.darkCircles);
  });

  it("does not let a user-selected concern inflate scores", () => {
    const withoutConcern = analyzeSkinFromFrame(makeCanvas(fillAcne).canvas, video, 25, 7, 2.5, 4, "none");
    const withConcern = analyzeSkinFromFrame(makeCanvas(fillAcne).canvas, video, 25, 7, 2.5, 4, "acne");
    const plainWithConcern = analyzeSkinFromFrame(makeCanvas(fillSkin).canvas, video, 25, 7, 2.5, 4, "acne");

    expect(withConcern.acneLevel).toBe(withoutConcern.acneLevel);
    expect(plainWithConcern.acneLevel).not.toBeGreaterThan(7);
  });
});
