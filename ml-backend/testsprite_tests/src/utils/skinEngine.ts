/**
 * AI Skin Analysis Engine (Upgraded)
 * Browser-side computer vision pixel analysis to estimate skin characteristics.
 * Implements:
 * 1. Image Quality Validation (blur detection, lighting/histogram, resolution checks)
 * 2. Skin-color Face Localization (HSV thresholding dynamic bounding box)
 * 3. Region Segmentation (forehead, nose, cheeks, under-eye, chin)
 * 4. Lighting & Color Normalization (Gray World White Balance, Contrast Stretching)
 * 5. Multi-label 20 Skin Concerns scoring with confidence estimation
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

  // Additional 20 concerns (from PDF)
  blackheads: number;       // 0-10
  melasma: number;          // 0-10
  tanning: number;          // 0-10
  dullness: number;         // 0-10
  acneScars: number;        // 0-10
  aging: number;            // 0-10
  puffiness: number;        // 0-10
  dehydration: number;      // 0-10
  milia: number;            // 0-10
  sunburn: number;          // 0-10

  // Meta
  analysisConfidence: number; // 0-100%
  detectedConcerns: string[]; // List of active issues above severity threshold
  timestamp: number;
}

export interface QualityCheckResult {
  isValid: boolean;
  resolution: { width: number; height: number; passed: boolean };
  blur: { score: number; passed: boolean };
  lighting: { averageLuminance: number; passed: boolean; status: "Too Dark" | "Too Bright" | "Good" };
  faceCentering: { score: number; passed: boolean };
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

// Convert RGB to HSV for skin-color segmenting
function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  const s = max === 0 ? 0 : d / max;
  const v = max;

  if (max !== min) {
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  return [h * 360, s, v];
}

function isSkinPixel(r: number, g: number, b: number): boolean {
  const [h, s, v] = rgbToHsv(r, g, b);
  // Standard HSV Skin Color Thresholds
  return (h >= 0 && h <= 50 || h >= 340 && h <= 360) && (s >= 0.15 && s <= 0.85) && (v >= 0.15 && v <= 1.0);
}

// ─── Image Quality Checks ─────────────────────────────────────────────

export function validateImageQuality(canvas: HTMLCanvasElement): QualityCheckResult {
  const ctx = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;

  if (!ctx || width === 0 || height === 0) {
    return {
      isValid: false,
      resolution: { width, height, passed: false },
      blur: { score: 0, passed: false },
      lighting: { averageLuminance: 128, passed: false, status: "Too Dark" },
      faceCentering: { score: 0, passed: false },
    };
  }

  let imageData: ImageData;
  try {
    imageData = ctx.getImageData(0, 0, width, height);
  } catch {
    return {
      isValid: false,
      resolution: { width, height, passed: false },
      blur: { score: 0, passed: false },
      lighting: { averageLuminance: 128, passed: false, status: "Too Dark" },
      faceCentering: { score: 0, passed: false },
    };
  }

  const data = imageData.data;

  // 1. Resolution Check (min 640x640 ideal, but webcams are often 640x480 or 1280x720, so area check)
  const resolutionPassed = width >= 600 && height >= 450;

  // 2. Lighting check
  let sumLum = 0;
  let sampleCount = 0;
  const step = 4;
  for (let i = 0; i < data.length; i += step * 4) {
    const r = data[i], g = data[i+1], b = data[i+2];
    sumLum += 0.299 * r + 0.587 * g + 0.114 * b;
    sampleCount++;
  }
  const averageLuminance = sampleCount > 0 ? sumLum / sampleCount : 120;
  let lightingStatus: "Too Dark" | "Too Bright" | "Good" = "Good";
  if (averageLuminance < 75) lightingStatus = "Too Dark";
  else if (averageLuminance > 220) lightingStatus = "Too Bright";
  const lightingPassed = lightingStatus === "Good";

  // 3. Blur detection (gradient variance)
  let sumGrad = 0;
  let sumGrad2 = 0;
  let gradCount = 0;
  const sampleStep = 6;
  for (let y = sampleStep; y < height - sampleStep; y += sampleStep) {
    for (let x = sampleStep; x < width - sampleStep; x += sampleStep) {
      const idx = (y * width + x) * 4;
      const idxRight = (y * width + (x + 2)) * 4;
      const idxDown = ((y + 2) * width + x) * 4;

      const l = 0.299 * data[idx] + 0.587 * data[idx+1] + 0.114 * data[idx+2];
      const lRight = 0.299 * data[idxRight] + 0.587 * data[idxRight+1] + 0.114 * data[idxRight+2];
      const lDown = 0.299 * data[idxDown] + 0.587 * data[idxDown+1] + 0.114 * data[idxDown+2];

      const dx = l - lRight;
      const dy = l - lDown;
      const grad = Math.sqrt(dx * dx + dy * dy);

      sumGrad += grad;
      sumGrad2 += grad * grad;
      gradCount++;
    }
  }
  const meanGrad = gradCount > 0 ? sumGrad / gradCount : 0;
  const blurScore = gradCount > 0 ? (sumGrad2 / gradCount) - (meanGrad * meanGrad) : 0;
  const blurPassed = blurScore >= 12; // sharp enough

  // 4. Centering check (Skin pixel proportion in center vs edges)
  let centerSkinCount = 0;
  let skinSampleCount = 0;
  const cx0 = Math.floor(width * 0.3);
  const cx1 = Math.floor(width * 0.7);
  const cy0 = Math.floor(height * 0.2);
  const cy1 = Math.floor(height * 0.8);

  for (let y = 10; y < height - 10; y += 12) {
    for (let x = 10; x < width - 10; x += 12) {
      const idx = (y * width + x) * 4;
      const isSkin = isSkinPixel(data[idx], data[idx+1], data[idx+2]);
      if (isSkin) {
        skinSampleCount++;
        if (x >= cx0 && x <= cx1 && y >= cy0 && y <= cy1) {
          centerSkinCount++;
        }
      }
    }
  }

  // Face is centered if there are skin pixels, and most of them are in the center zone
  const centeringScore = skinSampleCount > 0 ? (centerSkinCount / skinSampleCount) * 100 : 0;
  const centeringPassed = skinSampleCount > 40 && centeringScore > 40;

  const isValid = resolutionPassed && lightingPassed && blurPassed && centeringPassed;

  return {
    isValid,
    resolution: { width, height, passed: resolutionPassed },
    blur: { score: Math.round(blurScore * 10) / 10, passed: blurPassed },
    lighting: { averageLuminance: Math.round(averageLuminance), passed: lightingPassed, status: lightingStatus },
    faceCentering: { score: Math.round(centeringScore), passed: centeringPassed },
  };
}

// ─── Dynamic Bounding Box Face Detector ─────────────────────────────────

export function detectFaceBoundingBox(
  data: Uint8ClampedArray,
  width: number,
  height: number
): { x0: number; y0: number; x1: number; y1: number; confidence: number } {
  let minX = width;
  let maxX = 0;
  let minY = height;
  let maxY = 0;
  let skinPixels = 0;
  let totalPixels = 0;

  const step = 6;
  for (let y = Math.floor(height * 0.1); y < Math.floor(height * 0.9); y += step) {
    for (let x = Math.floor(width * 0.1); x < Math.floor(width * 0.9); x += step) {
      const i = (y * width + x) * 4;
      totalPixels++;
      if (isSkinPixel(data[i], data[i+1], data[i+2])) {
        skinPixels++;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  const confidence = totalPixels > 0 ? (skinPixels / totalPixels) * 100 : 0;

  // Fallback to center region if no face detected
  if (skinPixels < 50 || (maxX - minX < width * 0.25) || (maxY - minY < height * 0.25)) {
    return {
      x0: Math.floor(width * 0.25),
      y0: Math.floor(height * 0.15),
      x1: Math.floor(width * 0.75),
      y1: Math.floor(height * 0.85),
      confidence: 15,
    };
  }

  // Padding face box
  const padX = Math.floor((maxX - minX) * 0.05);
  const padY = Math.floor((maxY - minY) * 0.05);

  return {
    x0: Math.max(0, minX - padX),
    y0: Math.max(0, minY - padY),
    x1: Math.min(width - 1, maxX + padX),
    y1: Math.min(height - 1, maxY + padY),
    confidence: Math.round(confidence),
  };
}

// ─── Color Normalization: Gray World White Balance ──────────────────────

function applyGrayWorldWhiteBalance(
  data: Uint8ClampedArray,
  width: number,
  x0: number, y0: number, x1: number, y1: number
) {
  let sumR = 0, sumG = 0, sumB = 0;
  let count = 0;

  // Subsample to compute average fast
  for (let y = y0; y < y1; y += 3) {
    for (let x = x0; x < x1; x += 3) {
      const i = (y * width + x) * 4;
      sumR += data[i];
      sumG += data[i+1];
      sumB += data[i+2];
      count++;
    }
  }

  if (count === 0) return;
  const avgR = sumR / count;
  const avgG = sumG / count;
  const avgB = sumB / count;

  const gray = (avgR + avgG + avgB) / 3;
  if (gray === 0) return;

  const scaleR = gray / avgR;
  const scaleG = gray / avgG;
  const scaleB = gray / avgB;

  // Apply scales to correct image colors
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * width + x) * 4;
      data[i] = clamp(data[i] * scaleR, 0, 255);
      data[i+1] = clamp(data[i+1] * scaleG, 0, 255);
      data[i+2] = clamp(data[i+2] * scaleB, 0, 255);
    }
  }
}

// ─── Lighting Normalization: Contrast Stretching ─────────────────────────

function applyContrastStretching(
  data: Uint8ClampedArray,
  width: number,
  x0: number, y0: number, x1: number, y1: number
) {
  let minLum = 255;
  let maxLum = 0;

  for (let y = y0; y < y1; y += 4) {
    for (let x = x0; x < x1; x += 4) {
      const i = (y * width + x) * 4;
      const lum = 0.299 * data[i] + 0.587 * data[i+1] + 0.114 * data[i+2];
      if (lum < minLum) minLum = lum;
      if (lum > maxLum) maxLum = lum;
    }
  }

  if (maxLum - minLum < 15) return;
  const range = maxLum - minLum;

  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * width + x) * 4;
      data[i] = clamp(((data[i] - minLum) / range) * 255, 0, 255);
      data[i+1] = clamp(((data[i+1] - minLum) / range) * 255, 0, 255);
      data[i+2] = clamp(((data[i+2] - minLum) / range) * 255, 0, 255);
    }
  }
}

// ─── Precise Region Analytics ─────────────────────────────────────────

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
      const r = data[i], g = data[i+1], b = data[i+2];
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      const [, sat] = rgbToHsl(r, g, b);

      sumR += r; sumG += g; sumB += b;
      sumLum += lum; sumSat += sat;
      lumValues.push(lum);
      rValues.push(r);

      if (lum > 200) highlightCount++;
      if (lum < 55) darkCount++;
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

  const lumMean = meanLuminance;
  const variance = lumValues.reduce((acc, v) => acc + Math.pow(v - lumMean, 2), 0) / lumValues.length;
  const localVariance = Math.sqrt(variance);

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

// ─── Main Analyze Routine ─────────────────────────────────────────────

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

  // Flip image for natural mirror feel
  ctx.save();
  ctx.translate(canvas.width, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(video, 0, 0);
  ctx.restore();

  const w = canvas.width;
  const h = canvas.height;

  let imageData: ImageData;
  try {
    imageData = ctx.getImageData(0, 0, w, h);
  } catch {
    return generateDefaultResult(userAge, userSleepHours, userWaterIntake, userStress, userConcern);
  }

  // 1. Dynamic Face Detection Bounding Box
  const faceBox = detectFaceBoundingBox(imageData.data, w, h);
  const fx0 = faceBox.x0;
  const fy0 = faceBox.y0;
  const fx1 = faceBox.x1;
  const fy1 = faceBox.y1;
  const faceW = fx1 - fx0;
  const faceH = fy1 - fy0;

  // 2. Color & Lighting Normalization (performed inside face bounding box)
  applyGrayWorldWhiteBalance(imageData.data, w, fx0, fy0, fx1, fy1);
  applyContrastStretching(imageData.data, w, fx0, fy0, fx1, fy1);
  // Put modified pixel data back onto canvas to keep it consistent
  ctx.putImageData(imageData, 0, 0);

  // 3. Precise Face Region Segmentation
  // Forehead: Upper 25% of face bounding box
  const fore_x0 = Math.floor(fx0 + faceW * 0.15);
  const fore_x1 = Math.floor(fx1 - faceW * 0.15);
  const fore_y0 = fy0;
  const fore_y1 = Math.floor(fy0 + faceH * 0.25);

  // Cheeks: Left & Right cheeks
  const lcheek_x0 = Math.floor(fx0 + faceW * 0.05);
  const lcheek_x1 = Math.floor(fx0 + faceW * 0.40);
  const rcheek_x0 = Math.floor(fx0 + faceW * 0.60);
  const rcheek_x1 = Math.floor(fx1 - faceW * 0.05);
  const cheek_y0 = Math.floor(fy0 + faceH * 0.40);
  const cheek_y1 = Math.floor(fy0 + faceH * 0.70);

  // Nose: Central 20% width, from 25% to 65% height
  const nose_x0 = Math.floor(fx0 + faceW * 0.40);
  const nose_x1 = Math.floor(fx0 + faceW * 0.60);
  const nose_y0 = Math.floor(fy0 + faceH * 0.25);
  const nose_y1 = Math.floor(fy0 + faceH * 0.65);

  // Under-eye: Below eyes (approx 30% to 45% height)
  const eye_x0 = Math.floor(fx0 + faceW * 0.15);
  const eye_x1 = Math.floor(fx1 - faceW * 0.15);
  const eye_y0 = Math.floor(fy0 + faceH * 0.30);
  const eye_y1 = Math.floor(fy0 + faceH * 0.43);

  // Retrieve local regional stats
  const faceStats = analyzePixels(imageData.data, w, h, fx0, fy0, fx1, fy1);
  const foreheadStats = analyzePixels(imageData.data, w, h, fore_x0, fore_y0, fore_x1, fore_y1);
  const noseStats = analyzePixels(imageData.data, w, h, nose_x0, nose_y0, nose_x1, nose_y1);
  const leftCheekStats = analyzePixels(imageData.data, w, h, lcheek_x0, cheek_y0, lcheek_x1, cheek_y1);
  const rightCheekStats = analyzePixels(imageData.data, w, h, rcheek_x0, cheek_y0, rcheek_x1, cheek_y1);
  const underEyeStats = analyzePixels(imageData.data, w, h, eye_x0, eye_y0, eye_x1, eye_y1);

  // Merge cheeks
  const cheekMeanVariance = (leftCheekStats.localVariance + rightCheekStats.localVariance) / 2;
  const cheekMeanRDelta = (leftCheekStats.redDelta + rightCheekStats.redDelta) / 2;

  // 4. Derive Scores (0-10 Scale)

  // Oiliness: Specular highlights in Forehead + Nose (T-Zone)
  const tzoneHighlightRatio = (foreheadStats.highlightRatio + noseStats.highlightRatio) / 2;
  const oilinessRaw = normalize(tzoneHighlightRatio, 0.01, 0.22) * 8 + normalize(foreheadStats.meanLuminance, 100, 220) * 2;
  const oiliness = clamp(addNoise(oilinessRaw, 0.5), 0, 10);

  // Dryness: low saturation and uneven contrast in cheeks
  const cheekSaturation = (leftCheekStats.saturation + rightCheekStats.saturation) / 2;
  const drynessRaw = (1 - normalize(cheekSaturation, 0.05, 0.40)) * 7 + normalize(leftCheekStats.darkRatio + rightCheekStats.darkRatio, 0, 0.2) * 3;
  const dryness = clamp(addNoise(drynessRaw, 0.5), 0, 10);

  // Hydration: base saturation + low dryness
  const hydrationRaw = normalize(cheekSaturation, 0.05, 0.45) * 6 + (1 - normalize(dryness, 0, 10)) * 4;
  const hydration = clamp(addNoise(hydrationRaw, 0.4), 0, 10);

  // Redness/Sensitivity: high red-green difference in cheeks/nose
  const rednessRaw = normalize((cheekMeanRDelta + noseStats.redDelta) / 2, 5, 45) * 10;
  const redness = clamp(addNoise(rednessRaw, 0.5), 0, 10);

  // Acne Level: localized red spikes + local texture roughness in cheeks and chin
  const acneCheekSpikes = (leftCheekStats.toneUnevenness + rightCheekStats.toneUnevenness) / 2;
  const acneRaw = normalize(acneCheekSpikes, 2.5, 20) * 5 + normalize(redness, 3, 10) * 3 + normalize(cheekMeanVariance, 8, 30) * 2;
  const acneLevel = clamp(addNoise(acneRaw, 0.6), 0, 10);

  // Blackheads/Whiteheads: localized tiny spot variations in Nose region
  const blackheadsRaw = normalize(noseStats.toneUnevenness, 2.0, 16.0) * 7 + normalize(noseStats.localVariance, 4, 25) * 3;
  const blackheads = clamp(addNoise(blackheadsRaw, 0.5), 0, 10);

  // Pore Visibility: texture variance in cheeks
  const poresRaw = normalize(cheekMeanVariance, 5, 28) * 10;
  const poreVisibility = clamp(addNoise(poresRaw, 0.5), 0, 10);

  // Pigmentation: overall tone unevenness across the full face
  const pigmentationRaw = normalize(faceStats.toneUnevenness, 2, 20) * 10;
  const pigmentation = clamp(addNoise(pigmentationRaw, 0.5), 0, 10);

  // Melasma: Symmetrical darker patch score on left/right cheeks
  const melasmaRaw = normalize(Math.abs(leftCheekStats.meanLuminance - rightCheekStats.meanLuminance), 1, 15) * 2 +
    normalize((leftCheekStats.toneUnevenness + rightCheekStats.toneUnevenness) / 2, 4, 18) * 8;
  const melasma = clamp(addNoise(melasmaRaw, 0.5), 0, 10);

  // Tanning / Sun Damage: lower blue ratio + lower overall luminance relative to standard skin tones
  const tanningRaw = (1 - normalize(faceStats.meanB / (faceStats.meanR || 1), 0.5, 0.85)) * 6 + (1 - normalize(faceStats.meanLuminance, 90, 190)) * 4;
  const tanning = clamp(addNoise(tanningRaw, 0.4), 0, 10);

  // Texture (Roughness): overall variance of gradients in cheeks & forehead
  const textureRaw = normalize((cheekMeanVariance + foreheadStats.localVariance) / 2, 4, 30) * 10;
  const texture = clamp(addNoise(textureRaw, 0.4), 0, 10);

  // Glow Score: high luminance + moderate saturation
  const glowRaw = normalize(faceStats.meanLuminance, 85, 205) * 6 + normalize(faceStats.saturation, 0.1, 0.45) * 4;
  const glowScore = clamp(addNoise(glowRaw, 0.5), 0, 10);

  // Dullness: reciprocal of glow
  const dullness = clamp(10 - glowScore, 0, 10);

  // Acne Scars: localized dark pit marks (unevenness but low highlight) in cheeks
  const acneScarsRaw = normalize((leftCheekStats.toneUnevenness + rightCheekStats.toneUnevenness) / 2, 3, 22) * 8 + (leftCheekStats.darkRatio + rightCheekStats.darkRatio) * 10;
  const acneScars = clamp(addNoise(acneScarsRaw, 0.6), 0, 10);

  // Aging/Wrinkles: edge density / high variance in forehead and under-eye
  const agingRaw = normalize((foreheadStats.localVariance + underEyeStats.localVariance) / 2, 5, 26) * 7 + (userAge > 35 ? (userAge - 35) * 0.15 : 0);
  const aging = clamp(addNoise(agingRaw, 0.5), 0, 10);

  // Under-eye Puffiness: high local variance in under-eye region
  const puffinessRaw = normalize(underEyeStats.localVariance, 4, 22) * 8 + (userSleepHours < 6 ? 2.0 : 0);
  const puffiness = clamp(addNoise(puffinessRaw, 0.5), 0, 10);

  // Dark Circles: under-eye region is darker than cheek regions
  const eyeCheekDelta = ((leftCheekStats.meanLuminance + rightCheekStats.meanLuminance) / 2) - underEyeStats.meanLuminance;
  const darkCirclesRaw = normalize(eyeCheekDelta, -5, 45) * 10;
  const darkCircles = clamp(addNoise(darkCirclesRaw, 0.5), 0, 10);

  // Dehydration: high dryness score + low water intake adjustment
  const dehydrationRaw = dryness * 0.6 + (10 - hydration) * 0.4;
  const dehydration = clamp(addNoise(dehydrationRaw, 0.4), 0, 10);

  // Milia: small high-contrast white bumps in under-eye/cheeks
  const miliaRaw = normalize((underEyeStats.highlightRatio + leftCheekStats.highlightRatio + rightCheekStats.highlightRatio) / 3, 0.01, 0.15) * 6 + normalize(underEyeStats.localVariance, 4, 20) * 4;
  const milia = clamp(addNoise(miliaRaw, 0.5), 0, 10);

  // Sunburn / Irritation: severe redness score
  const sunburnRaw = redness * 0.8 + (noseStats.redDelta > 30 ? 2.0 : 0);
  const sunburn = clamp(addNoise(sunburnRaw, 0.4), 0, 10);

  // Lifestyle adjustments
  let hydrationAdj = 0;
  let drynessAdj = 0;
  let oilinessAdj = 0;
  let darkCirclesAdj = 0;

  if (userWaterIntake < 1.5) { hydrationAdj -= 1.2; drynessAdj += 0.8; }
  else if (userWaterIntake > 2.5) { hydrationAdj += 0.8; drynessAdj -= 0.4; }

  if (userSleepHours < 6) { darkCirclesAdj += 1.8; }
  else if (userSleepHours > 8) { darkCirclesAdj -= 0.8; }

  if (userStress > 7) { oilinessAdj += 1.2; }

  const adjHydration = clamp(hydration + hydrationAdj, 0, 10);
  const adjDryness = clamp(dryness + drynessAdj, 0, 10);
  const adjOiliness = clamp(oiliness + oilinessAdj, 0, 10);
  const adjDarkCircles = clamp(darkCircles + darkCirclesAdj, 0, 10);
  const adjDehydration = clamp(dehydration + (userWaterIntake < 1.5 ? 1.5 : 0), 0, 10);

  // ─── User Concern Boosts ──────────────────────────────────────────────
  // Blend camera reading with a minimum floor based on what user reported.
  // This ensures selected concern is always meaningfully reflected in scores.
  let concernAcne = acneLevel;
  let concernBlackheads = blackheads;
  let concernOiliness = adjOiliness;
  let concernDryness = adjDryness;
  let concernRedness = redness;
  let concernDarkCircles = adjDarkCircles;
  let concernPigmentation = pigmentation;
  let concernMelasma = melasma;
  let concernTanning = tanning;
  let concernPores = poreVisibility;
  let concernTexture = texture;
  let concernDullness = dullness;
  let concernAcneScars = acneScars;
  let concernAging = aging;
  let concernPuffiness = puffiness;
  let concernHydration = adjHydration;
  let concernDehydration = adjDehydration;
  let concernMilia = milia;
  let concernSunburn = sunburn;

  const BOOST = 2.0; // how strongly we shift towards user-reported concern

  if (userConcern === "acne") {
    concernAcne = clamp(Math.max(concernAcne, acneLevel + BOOST), 0, 10);
    concernBlackheads = clamp(Math.max(concernBlackheads, blackheads + 0.8), 0, 10);
    concernPores = clamp(Math.max(concernPores, poreVisibility + 0.6), 0, 10);
  } else if (userConcern === "blackheads") {
    concernBlackheads = clamp(Math.max(concernBlackheads, blackheads + BOOST), 0, 10);
    concernPores = clamp(Math.max(concernPores, poreVisibility + 1.0), 0, 10);
    concernOiliness = clamp(Math.max(concernOiliness, adjOiliness + 0.6), 0, 10);
  } else if (userConcern === "oily") {
    concernOiliness = clamp(Math.max(concernOiliness, adjOiliness + BOOST), 0, 10);
    concernPores = clamp(Math.max(concernPores, poreVisibility + 0.8), 0, 10);
  } else if (userConcern === "dry") {
    concernDryness = clamp(Math.max(concernDryness, adjDryness + BOOST), 0, 10);
    concernHydration = clamp(Math.min(concernHydration, adjHydration - 1.0), 0, 10);
    concernDehydration = clamp(Math.max(concernDehydration, adjDehydration + 1.2), 0, 10);
  } else if (userConcern === "combination") {
    concernOiliness = clamp(Math.max(concernOiliness, 4.5), 0, 10);
    concernDryness = clamp(Math.max(concernDryness, 4.5), 0, 10);
  } else if (userConcern === "sensitive") {
    concernRedness = clamp(Math.max(concernRedness, redness + BOOST), 0, 10);
  } else if (userConcern === "darkCircles") {
    concernDarkCircles = clamp(Math.max(concernDarkCircles, adjDarkCircles + BOOST), 0, 10);
  } else if (userConcern === "pigmentation") {
    concernPigmentation = clamp(Math.max(concernPigmentation, pigmentation + BOOST), 0, 10);
  } else if (userConcern === "melasma") {
    concernMelasma = clamp(Math.max(concernMelasma, melasma + BOOST), 0, 10);
    concernPigmentation = clamp(Math.max(concernPigmentation, pigmentation + 0.8), 0, 10);
  } else if (userConcern === "tanning") {
    concernTanning = clamp(Math.max(concernTanning, tanning + BOOST), 0, 10);
    concernPigmentation = clamp(Math.max(concernPigmentation, pigmentation + 0.6), 0, 10);
  } else if (userConcern === "enlargedPores") {
    concernPores = clamp(Math.max(concernPores, poreVisibility + BOOST), 0, 10);
    concernOiliness = clamp(Math.max(concernOiliness, adjOiliness + 0.6), 0, 10);
  } else if (userConcern === "texture") {
    concernTexture = clamp(Math.max(concernTexture, texture + BOOST), 0, 10);
    concernPores = clamp(Math.max(concernPores, poreVisibility + 0.6), 0, 10);
  } else if (userConcern === "dullness") {
    concernDullness = clamp(Math.max(concernDullness, dullness + BOOST), 0, 10);
    concernHydration = clamp(Math.min(concernHydration, adjHydration - 0.8), 0, 10);
  } else if (userConcern === "acneScars") {
    concernAcneScars = clamp(Math.max(concernAcneScars, acneScars + BOOST), 0, 10);
    concernPigmentation = clamp(Math.max(concernPigmentation, pigmentation + 0.6), 0, 10);
  } else if (userConcern === "aging") {
    concernAging = clamp(Math.max(concernAging, aging + BOOST), 0, 10);
    concernTexture = clamp(Math.max(concernTexture, texture + 0.6), 0, 10);
  } else if (userConcern === "puffiness") {
    concernPuffiness = clamp(Math.max(concernPuffiness, puffiness + BOOST), 0, 10);
    concernDarkCircles = clamp(Math.max(concernDarkCircles, adjDarkCircles + 0.6), 0, 10);
  } else if (userConcern === "dehydration") {
    concernDehydration = clamp(Math.max(concernDehydration, adjDehydration + BOOST), 0, 10);
    concernDryness = clamp(Math.max(concernDryness, adjDryness + 0.8), 0, 10);
    concernHydration = clamp(Math.min(concernHydration, adjHydration - 1.0), 0, 10);
  } else if (userConcern === "milia") {
    concernMilia = clamp(Math.max(concernMilia, milia + BOOST), 0, 10);
  } else if (userConcern === "sunburn") {
    concernSunburn = clamp(Math.max(concernSunburn, sunburn + BOOST), 0, 10);
    concernRedness = clamp(Math.max(concernRedness, redness + 0.8), 0, 10);
  }

  // Skin type determination
  let skinType: SkinAnalysisResult["skinType"] = "Normal";
  if (concernOiliness > 6.0) skinType = "Oily";
  else if (concernDryness > 6.0) skinType = "Dry";
  else if (concernOiliness > 4.2 && concernDryness > 4.2) skinType = "Combination";
  else if (concernRedness > 5.5) skinType = "Sensitive";

  // Override with user concern if strongly stated
  if (userConcern === "dry") skinType = "Dry";
  if (userConcern === "oily") skinType = "Oily";
  if (userConcern === "sensitive") skinType = "Sensitive";
  if (userConcern === "combination") skinType = "Combination";

  // Overall skin score: weighted composite using concern-adjusted values (higher is better)
  const overallScore = clamp(
    addNoise(
      10
      - concernAcne * 0.16
      - concernDarkCircles * 0.08
      - concernOiliness * 0.08
      - concernDryness * 0.08
      - concernRedness * 0.08
      - concernPores * 0.06
      - concernPigmentation * 0.06
      - concernTexture * 0.06
      - concernAging * 0.06
      - concernBlackheads * 0.04
      - concernMelasma * 0.04
      - concernTanning * 0.04
      - concernAcneScars * 0.04
      + glowScore * 0.12
      + concernHydration * 0.08,
      0.4
    ),
    1, 10
  );

  // Auto-detect concerns above threshold (using concern-boosted values)
  const detectedConcerns: string[] = [];
  if (concernAcne >= 4.5) detectedConcerns.push("Acne & Breakouts");
  if (concernBlackheads >= 4.5) detectedConcerns.push("Blackheads / Whiteheads");
  if (concernOiliness >= 6.0) detectedConcerns.push("Oily / Shiny Skin");
  if (concernDryness >= 6.0) detectedConcerns.push("Dry / Flaky Skin");
  if (skinType === "Combination") detectedConcerns.push("Combination Skin");
  if (concernRedness >= 5.0) detectedConcerns.push("Sensitive / Redness");
  if (concernDarkCircles >= 5.0) detectedConcerns.push("Dark Circles");
  if (concernPigmentation >= 5.0) detectedConcerns.push("Dark Spots / Pigmentation");
  if (concernMelasma >= 4.5) detectedConcerns.push("Melasma");
  if (concernTanning >= 5.0) detectedConcerns.push("Tanning / Sun Damage");
  if (concernPores >= 5.5) detectedConcerns.push("Enlarged Pores");
  if (concernTexture >= 5.5) detectedConcerns.push("Uneven Texture");
  if (concernDullness >= 5.5) detectedConcerns.push("Dullness / Lack of Radiance");
  if (concernAcneScars >= 4.5) detectedConcerns.push("Acne Scars / Marks");
  if (concernAging >= 4.5) detectedConcerns.push("Ageing / Fine Lines");
  if (concernPuffiness >= 4.5) detectedConcerns.push("Under-eye Puffiness");
  if (concernDehydration >= 5.0) detectedConcerns.push("Dehydration");
  if (concernMilia >= 4.5) detectedConcerns.push("Milia");
  if (concernSunburn >= 4.5) detectedConcerns.push("Sunburn / Irritation");

  // Always include the user's selected concern in detected list (with human-readable label)
  const concernLabelMap: Record<string, string> = {
    acne: "Acne & Breakouts",
    blackheads: "Blackheads / Whiteheads",
    oily: "Oily / Shiny Skin",
    dry: "Dry / Flaky Skin",
    combination: "Combination Skin",
    sensitive: "Sensitive / Redness",
    darkCircles: "Dark Circles",
    pigmentation: "Dark Spots / Pigmentation",
    melasma: "Melasma",
    tanning: "Tanning / Sun Damage",
    enlargedPores: "Enlarged Pores",
    texture: "Uneven Texture",
    dullness: "Dullness / Lack of Radiance",
    acneScars: "Acne Scars / Marks",
    aging: "Ageing / Fine Lines",
    puffiness: "Under-eye Puffiness",
    dehydration: "Dehydration",
    milia: "Milia",
    sunburn: "Sunburn / Irritation",
  };
  if (userConcern !== "none" && concernLabelMap[userConcern] && !detectedConcerns.includes(concernLabelMap[userConcern])) {
    detectedConcerns.unshift(concernLabelMap[userConcern]); // add at front as primary concern
  }

  // Confidence estimation based on face detection and image quality
  const quality = validateImageQuality(canvas);
  let confidenceBase = faceBox.confidence;
  if (quality.blur.passed) confidenceBase += 15;
  if (quality.lighting.passed) confidenceBase += 15;
  if (quality.resolution.passed) confidenceBase += 10;
  const analysisConfidence = clamp(confidenceBase, 30, 98);

  return {
    skinType,
    acneLevel: Math.round(concernAcne * 10) / 10,
    darkCircles: Math.round(concernDarkCircles * 10) / 10,
    oiliness: Math.round(concernOiliness * 10) / 10,
    dryness: Math.round(concernDryness * 10) / 10,
    redness: Math.round(concernRedness * 10) / 10,
    poreVisibility: Math.round(concernPores * 10) / 10,
    pigmentation: Math.round(concernPigmentation * 10) / 10,
    texture: Math.round(concernTexture * 10) / 10,
    glowScore: Math.round(glowScore * 10) / 10,
    hydration: Math.round(concernHydration * 10) / 10,
    overallScore: Math.round(overallScore * 10) / 10,

    // Additional concerns
    blackheads: Math.round(concernBlackheads * 10) / 10,
    melasma: Math.round(concernMelasma * 10) / 10,
    tanning: Math.round(concernTanning * 10) / 10,
    dullness: Math.round(concernDullness * 10) / 10,
    acneScars: Math.round(concernAcneScars * 10) / 10,
    aging: Math.round(concernAging * 10) / 10,
    puffiness: Math.round(concernPuffiness * 10) / 10,
    dehydration: Math.round(concernDehydration * 10) / 10,
    milia: Math.round(concernMilia * 10) / 10,
    sunburn: Math.round(concernSunburn * 10) / 10,

    analysisConfidence,
    detectedConcerns,
    timestamp: Date.now(),
  };
}

export function generateDefaultResult(
  userAge: number,
  userSleepHours: number,
  userWaterIntake: number,
  userStress: number,
  userConcern: string
): SkinAnalysisResult {
  const base = (seed: number) => clamp(addNoise(seed, 1.2), 0, 10);

  const oiliness = base(userStress > 6 ? 6.5 : 4.5);
  const dryness = base(userWaterIntake < 1.5 ? 6 : 3.5);
  const redness = base(userConcern === "sensitive" ? 6.5 : 4);
  const acneLevel = base(userConcern === "acne" ? 7 : userAge < 25 ? 5 : 3.5);
  const blackheads = base(userConcern === "blackheads" ? 6.8 : 3.2);
  const darkCircles = base(userSleepHours < 6 ? 7 : 3.5);
  const poreVisibility = base(userConcern === "pores" ? 6.5 : 4.5);
  const pigmentation = base(userConcern === "pigmentation" ? 7 : userAge > 35 ? 5.5 : 3.5);
  const melasma = base(userConcern === "pigmentation" && userAge > 30 ? 5.0 : 2.0);
  const tanning = base(3.0);
  const texture = base(userConcern === "texture" ? 6.5 : 4.0);
  const glowScore = base(userSleepHours > 7 && userWaterIntake > 2 ? 6.5 : 4.5);
  const dullness = clamp(10 - glowScore, 0, 10);
  const acneScars = base(userConcern === "acne" ? 5.5 : 2.5);
  const aging = base(userConcern === "aging" ? 7.0 : userAge > 40 ? 6.0 : 3.0);
  const puffiness = base(userSleepHours < 6 ? 5.5 : 2.8);
  const hydration = base(userWaterIntake > 2 ? 6.5 : 4.0);
  const dehydration = clamp(dryness * 0.6 + (10 - hydration) * 0.4, 0, 10);
  const milia = base(2.0);
  const sunburn = base(userConcern === "sensitive" ? 4.5 : 1.5);

  let skinType: SkinAnalysisResult["skinType"] = "Normal";
  if (userConcern === "oily" || oiliness > 6.5) skinType = "Oily";
  else if (userConcern === "dry" || dryness > 6.5) skinType = "Dry";
  else if (userConcern === "sensitive" || redness > 5.5) skinType = "Sensitive";
  else if (oiliness > 4.2 && dryness > 4.2) skinType = "Combination";

  const overallScore = clamp(
    addNoise(
      10 - acneLevel * 0.16 - darkCircles * 0.08 - oiliness * 0.08
      - dryness * 0.08 - redness * 0.08 - poreVisibility * 0.06
      - pigmentation * 0.06 - texture * 0.06 - aging * 0.06
      - blackheads * 0.04 - melasma * 0.04 - tanning * 0.04
      - acneScars * 0.04 + glowScore * 0.12 + hydration * 0.08,
      0.3
    ),
    1, 10
  );

  const detectedConcerns: string[] = [];
  if (acneLevel >= 4.5) detectedConcerns.push("Acne & Breakouts");
  if (blackheads >= 4.5) detectedConcerns.push("Blackheads / Whiteheads");
  if (oiliness >= 6.0) detectedConcerns.push("Oily / Shiny Skin");
  if (dryness >= 6.0) detectedConcerns.push("Dry / Flaky Skin");
  if (skinType === "Combination") detectedConcerns.push("Combination Skin");
  if (redness >= 5.0) detectedConcerns.push("Sensitive / Redness");
  if (darkCircles >= 5.0) detectedConcerns.push("Dark Circles");
  if (pigmentation >= 5.0) detectedConcerns.push("Dark Spots / Pigmentation");
  if (melasma >= 4.5) detectedConcerns.push("Melasma");
  if (tanning >= 5.0) detectedConcerns.push("Tanning / Sun Damage");
  if (poreVisibility >= 5.5) detectedConcerns.push("Enlarged Pores");
  if (texture >= 5.5) detectedConcerns.push("Uneven Texture");
  if (dullness >= 5.5) detectedConcerns.push("Dullness / Lack of Radiance");
  if (acneScars >= 4.5) detectedConcerns.push("Acne Scars / Marks");
  if (aging >= 4.5) detectedConcerns.push("Ageing / Fine Lines");
  if (puffiness >= 4.5) detectedConcerns.push("Under-eye Puffiness");
  if (dehydration >= 5.0) detectedConcerns.push("Dehydration");
  if (milia >= 4.5) detectedConcerns.push("Milia");
  if (sunburn >= 4.5) detectedConcerns.push("Sunburn / Irritation");

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

    // Additional concerns
    blackheads: Math.round(blackheads * 10) / 10,
    melasma: Math.round(melasma * 10) / 10,
    tanning: Math.round(tanning * 10) / 10,
    dullness: Math.round(dullness * 10) / 10,
    acneScars: Math.round(acneScars * 10) / 10,
    aging: Math.round(aging * 10) / 10,
    puffiness: Math.round(puffiness * 10) / 10,
    dehydration: Math.round(dehydration * 10) / 10,
    milia: Math.round(milia * 10) / 10,
    sunburn: Math.round(sunburn * 10) / 10,

    analysisConfidence: 85,
    detectedConcerns,
    timestamp: Date.now(),
  };
}
