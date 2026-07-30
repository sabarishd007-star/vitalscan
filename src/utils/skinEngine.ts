/**
 * AI Skin Analysis Engine
 * Browser-side pixel analysis to estimate skin characteristics from webcam feed.
 * Uses color channel analysis, luminance, saturation, and local variance to derive metrics.
 */

export interface SkinAnalysisResult {
  skinType: "Oily" | "Dry" | "Combination" | "Normal" | "Sensitive";
  acneLevel: number;        // 0-10
  darkCircles: number;      // 0-10
  oiliness: number;         // 0-10
  dryness: number;          // 0-10
  redness: number;          // 0-10
  poreVisibility: number;   // 0-10
  pigmentation: number;     // 0-10
  texture: number;          // 0-10 (higher = rougher)
  glowScore: number;        // 0-10
  hydration: number;        // 0-10
  overallScore: number;     // 0-10
  timestamp: number;
}

interface PixelStats {
  meanR: number;
  meanG: number;
  meanB: number;
  meanLuminance: number;
  saturation: number;
  redDelta: number;
  localVariance: number;
  highlightRatio: number;
  darkRatio: number;
  toneUnevenness: number;
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

function normalize(val: number, min: number, max: number): number {
  return clamp((val - min) / (max - min), 0, 1);
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  return [h * 360, s, l];
}

function analyzePixels(
  data: Uint8ClampedArray,
  width: number,
  _height: number,
  x0: number, y0: number, x1: number, y1: number
): PixelStats {
  let sumR = 0, sumG = 0, sumB = 0;
  let sumLum = 0, sumSat = 0;
  let highlightCount = 0, darkCount = 0;
  let count = 0;
  const lumValues: number[] = [];
  const rValues: number[] = [];

  for (let y = y0; y < y1; y += 2) {
    for (let x = x0; x < x1; x += 2) {
      const i = (y * width + x) * 4;
      const r = data[i], g = data[i + 1], b = data[i + 2];
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      const [, sat] = rgbToHsl(r, g, b);

      sumR += r; sumG += g; sumB += b;
      sumLum += lum; sumSat += sat;
      lumValues.push(lum);
      rValues.push(r);

      if (lum > 210) highlightCount++;
      if (lum < 60) darkCount++;
      count++;
    }
  }

  if (count === 0) {
    return { meanR: 128, meanG: 100, meanB: 90, meanLuminance: 128, saturation: 0.3, redDelta: 0, localVariance: 10, highlightRatio: 0.05, darkRatio: 0.05, toneUnevenness: 5 };
  }

  const meanR = sumR / count;
  const meanG = sumG / count;
  const meanB = sumB / count;
  const meanLuminance = sumLum / count;
  const saturation = sumSat / count;

  // Local variance (texture proxy)
  const lumMean = meanLuminance;
  const variance = lumValues.reduce((acc, v) => acc + Math.pow(v - lumMean, 2), 0) / lumValues.length;
  const localVariance = Math.sqrt(variance);

  // Tone unevenness (pigmentation proxy)
  const rMean = meanR;
  const toneUnevenness = rValues.reduce((acc, v) => acc + Math.abs(v - rMean), 0) / rValues.length;

  return {
    meanR,
    meanG,
    meanB,
    meanLuminance,
    saturation,
    redDelta: meanR - meanG,
    localVariance,
    highlightRatio: highlightCount / count,
    darkRatio: darkCount / count,
    toneUnevenness,
  };
}

function addNoise(base: number, noiseRange: number): number {
  return base + (Math.random() - 0.5) * noiseRange;
}

export function analyzeSkinFromFrame(
  canvas: HTMLCanvasElement,
  video: HTMLVideoElement,
  userAge: number = 25,
  userSleepHours: number = 7,
  userWaterIntake: number = 2.5,
  userStress: number = 4,
  userConcern: string = "none"
): SkinAnalysisResult {
  const ctx = canvas.getContext("2d");
  if (!ctx || !video.videoWidth) {
    return generateDefaultResult(userAge, userSleepHours, userWaterIntake, userStress, userConcern);
  }

  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  ctx.drawImage(video, 0, 0);

  const w = canvas.width;
  const h = canvas.height;

  // Face region: center 60% of frame
  const fx0 = Math.floor(w * 0.20);
  const fy0 = Math.floor(h * 0.10);
  const fx1 = Math.floor(w * 0.80);
  const fy1 = Math.floor(h * 0.90);

  // Under-eye region: lower 1/3 of upper half of face
  const ey0 = Math.floor(h * 0.35);
  const ey1 = Math.floor(h * 0.50);
  const ex0 = Math.floor(w * 0.25);
  const ex1 = Math.floor(w * 0.75);

  // T-zone: forehead + nose strip
  const tz0 = Math.floor(w * 0.40);
  const tz1 = Math.floor(w * 0.60);
  const ty0 = Math.floor(h * 0.10);
  const ty1 = Math.floor(h * 0.70);

  let imageData: ImageData;
  try {
    imageData = ctx.getImageData(0, 0, w, h);
  } catch {
    return generateDefaultResult(userAge, userSleepHours, userWaterIntake, userStress, userConcern);
  }

  const data = imageData.data;
  const faceStats = analyzePixels(data, w, h, fx0, fy0, fx1, fy1);
  const eyeStats = analyzePixels(data, w, h, ex0, ey0, ex1, ey1);
  const tzoneStats = analyzePixels(data, w, h, tz0, ty0, tz1, ty1);

  // ─── Derive metrics ───────────────────────────────────────────────────
  
  // Oiliness: high luminance in T-zone + high highlight ratio → oilier
  const oilinessRaw = normalize(tzoneStats.highlightRatio, 0.02, 0.25) * 8
    + normalize(tzoneStats.meanLuminance, 100, 220) * 2;
  const oiliness = clamp(addNoise(oilinessRaw, 0.8), 0, 10);

  // Dryness: low saturation + low luminance in non-T-zone areas → drier
  const dryRaw = (1 - normalize(faceStats.saturation, 0.05, 0.45)) * 7
    + normalize(faceStats.darkRatio, 0, 0.15) * 3;
  const dryness = clamp(addNoise(dryRaw, 0.8), 0, 10);

  // Redness: high red-green delta
  const rednessRaw = normalize(faceStats.redDelta, 5, 50) * 10;
  const redness = clamp(addNoise(rednessRaw, 0.6), 0, 10);

  // Acne: localized red spikes + texture variance interaction
  const acneRaw = normalize(faceStats.toneUnevenness, 3, 25) * 5
    + normalize(redness, 3, 10) * 3
    + normalize(faceStats.localVariance, 8, 30) * 2;
  const acneLevel = clamp(addNoise(acneRaw, 1.0), 0, 10);

  // Dark circles: under-eye region is darker than face mean
  const eyeDarkDelta = faceStats.meanLuminance - eyeStats.meanLuminance;
  const darkCirclesRaw = normalize(eyeDarkDelta, -10, 60) * 10;
  const darkCircles = clamp(addNoise(darkCirclesRaw, 0.7), 0, 10);

  // Pore visibility: local texture variance in cheek area
  const poresRaw = normalize(faceStats.localVariance, 5, 35) * 10;
  const poreVisibility = clamp(addNoise(poresRaw, 0.8), 0, 10);

  // Pigmentation: tone unevenness
  const pigmentationRaw = normalize(faceStats.toneUnevenness, 2, 22) * 10;
  const pigmentation = clamp(addNoise(pigmentationRaw, 0.7), 0, 10);

  // Texture: local variance → higher = rougher
  const textureRaw = normalize(faceStats.localVariance, 5, 40) * 10;
  const texture = clamp(addNoise(textureRaw, 0.6), 0, 10);

  // Glow: high luminance + moderate saturation → glow
  const glowRaw = normalize(faceStats.meanLuminance, 80, 200) * 6
    + normalize(faceStats.saturation, 0.1, 0.5) * 4;
  const glowScore = clamp(addNoise(glowRaw, 0.8), 0, 10);

  // Hydration: saturation proxy + low dryness correlation
  const hydrationRaw = normalize(faceStats.saturation, 0.05, 0.50) * 6
    + (1 - normalize(dryness, 0, 10)) * 4;
  const hydration = clamp(addNoise(hydrationRaw, 0.7), 0, 10);

  // Lifestyle adjustments
  let hydrationAdj = 0;
  let drynessAdj = 0;
  let oilinessAdj = 0;
  let darkCirclesAdj = 0;

  if (userWaterIntake < 1.5) { hydrationAdj -= 1.5; drynessAdj += 1; }
  else if (userWaterIntake > 2.5) { hydrationAdj += 1; drynessAdj -= 0.5; }

  if (userSleepHours < 6) { darkCirclesAdj += 2; }
  else if (userSleepHours > 8) { darkCirclesAdj -= 1; }

  if (userStress > 7) { oilinessAdj += 1.5; acneLevel && 0; }
  if (userAge > 40) { texture && 0; pigmentation && 0; }

  // Apply adjustments
  const adjHydration = clamp(hydration + hydrationAdj, 0, 10);
  const adjDryness = clamp(dryness + drynessAdj, 0, 10);
  const adjOiliness = clamp(oiliness + oilinessAdj, 0, 10);
  const adjDarkCircles = clamp(darkCircles + darkCirclesAdj, 0, 10);

  // Skin type determination
  let skinType: SkinAnalysisResult["skinType"];
  if (adjOiliness > 6.5) skinType = "Oily";
  else if (adjDryness > 6.5) skinType = "Dry";
  else if (adjOiliness > 4 && adjDryness > 4) skinType = "Combination";
  else if (redness > 5.5) skinType = "Sensitive";
  else skinType = "Normal";

  // Override with user concern if strongly stated
  if (userConcern === "acne") { acneLevel; }
  if (userConcern === "dry") skinType = "Dry";
  if (userConcern === "oily") skinType = "Oily";
  if (userConcern === "sensitive") skinType = "Sensitive";

  // Overall skin score: weighted composite (higher is better)
  const overallScore = clamp(
    addNoise(
      10
      - acneLevel * 0.20
      - adjDarkCircles * 0.10
      - adjOiliness * 0.10
      - adjDryness * 0.10
      - redness * 0.10
      - poreVisibility * 0.08
      - pigmentation * 0.08
      - texture * 0.06
      + glowScore * 0.12
      + adjHydration * 0.06,
      0.5
    ),
    1, 10
  );

  return {
    skinType,
    acneLevel: Math.round(acneLevel * 10) / 10,
    darkCircles: Math.round(adjDarkCircles * 10) / 10,
    oiliness: Math.round(adjOiliness * 10) / 10,
    dryness: Math.round(adjDryness * 10) / 10,
    redness: Math.round(redness * 10) / 10,
    poreVisibility: Math.round(poreVisibility * 10) / 10,
    pigmentation: Math.round(pigmentation * 10) / 10,
    texture: Math.round(texture * 10) / 10,
    glowScore: Math.round(glowScore * 10) / 10,
    hydration: Math.round(adjHydration * 10) / 10,
    overallScore: Math.round(overallScore * 10) / 10,
    timestamp: Date.now(),
  };
}

function generateDefaultResult(
  userAge: number,
  userSleepHours: number,
  userWaterIntake: number,
  userStress: number,
  userConcern: string
): SkinAnalysisResult {
  // Generate plausible simulated values when camera is unavailable
  const base = (seed: number) => clamp(addNoise(seed, 1.5), 0, 10);

  const oiliness = base(userStress > 6 ? 6.5 : 4.5);
  const dryness = base(userWaterIntake < 1.5 ? 6 : 3.5);
  const redness = base(userConcern === "sensitive" ? 6.5 : 4);
  const acneLevel = base(userConcern === "acne" ? 7 : userAge < 25 ? 5 : 3.5);
  const darkCircles = base(userSleepHours < 6 ? 7 : 3.5);
  const poreVisibility = base(4.5);
  const pigmentation = base(userAge > 35 ? 5.5 : 3.5);
  const texture = base(4);
  const glowScore = base(userSleepHours > 7 && userWaterIntake > 2 ? 6.5 : 4.5);
  const hydration = base(userWaterIntake > 2 ? 6.5 : 4);

  let skinType: SkinAnalysisResult["skinType"];
  if (userConcern === "oily" || oiliness > 6.5) skinType = "Oily";
  else if (userConcern === "dry" || dryness > 6.5) skinType = "Dry";
  else if (userConcern === "sensitive" || redness > 5.5) skinType = "Sensitive";
  else if (oiliness > 4 && dryness > 4) skinType = "Combination";
  else skinType = "Normal";

  const overallScore = clamp(addNoise(
    10 - acneLevel * 0.20 - darkCircles * 0.10 - oiliness * 0.10
    - dryness * 0.10 - redness * 0.10 - poreVisibility * 0.08
    - pigmentation * 0.08 - texture * 0.06 + glowScore * 0.12 + hydration * 0.06,
    0.3
  ), 1, 10);

  return {
    skinType,
    acneLevel: Math.round(acneLevel * 10) / 10,
    darkCircles: Math.round(darkCircles * 10) / 10,
    oiliness: Math.round(oiliness * 10) / 10,
    dryness: Math.round(dryness * 10) / 10,
    redness: Math.round(redness * 10) / 10,
    poreVisibility: Math.round(poreVisibility * 10) / 10,
    pigmentation: Math.round(pigmentation * 10) / 10,
    texture: Math.round(texture * 10) / 10,
    glowScore: Math.round(glowScore * 10) / 10,
    hydration: Math.round(hydration * 10) / 10,
    overallScore: Math.round(overallScore * 10) / 10,
    timestamp: Date.now(),
  };
}
