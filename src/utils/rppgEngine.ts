/**
 * Remote Photoplethysmography (rPPG) Engine
 * Analyzes micro-color variations in facial skin (Green channel ~550nm) to
 * estimate Heart Rate (BPM), Heart Rate Variability (HRV), and Stress.
 *
 * Honesty contract:
 *  - Heart rate / HRV / stress are derived from the captured pulse waveform.
 *  - Respiration is NOT reported. Camera rPPG respiration (RSA-based) needs a
 *    much longer, cleaner recording than a single short scan provides, and
 *    naive estimators produce spurious values; we therefore always report
 *    respiration as "not measured" rather than fabricate a number.
 *  - Blood pressure and oxygen saturation (SpO2) are NOT measured by a camera.
 *    These fields are always null and must be rendered as "Not measured".
 *  - Output is fully deterministic: no random values are injected.
 */

export type StressLevel = "Unknown" | "Low" | "Moderate" | "High";

export interface RPPGResult {
  heartRate: number;
  heartRateConfidence: "high" | "low";
  stressLevel: StressLevel;
  healthScore: number;
  riskLevel: string;
  respirationRate: number | null;
  bloodPressure: string | null;
  oxygenLevel: number | null;
  signalBuffer: number[];
}

interface PulseEstimate {
  bpm: number;
  hrv: number;
  peaks: number;
}

export class RPPGAnalyzer {
  private buffer: number[] = [];
  private timestamps: number[] = [];
  private readonly maxBufferSize = 300; // ~10 seconds at 30fps

  /**
   * Process a single video frame from an HTMLVideoElement or HTMLCanvasElement
   */
  public processFrame(
    canvas: HTMLCanvasElement,
    video: HTMLVideoElement
  ): number | null {
    if (!video.videoWidth || !video.videoHeight) return null;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    // Draw current frame
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Define Region of Interest (ROI): Forehead / Upper Face Center (approx 30% width, 25% height)
    const roiX = canvas.width * 0.35;
    const roiY = canvas.height * 0.2;
    const roiW = canvas.width * 0.3;
    const roiH = canvas.height * 0.25;

    // Get image data for ROI
    const imageData = ctx.getImageData(roiX, roiY, roiW, roiH);
    const data = imageData.data;

    let greenSum = 0;
    let count = 0;

    // Sample pixels in ROI (step size 4 for performance)
    for (let i = 0; i < data.length; i += 16) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];

      // Simple skin tone filter (R > G > B)
      if (r > 40 && g > 30 && r > b && (r - g) > 5) {
        greenSum += g;
        count++;
      }
    }

    const avgGreen = count > 0 ? greenSum / count : 128;

    this.pushSample(avgGreen, performance.now());
    return avgGreen;
  }

  /**
   * Record a raw signal sample (used for programmatic input / testing).
   */
  public pushSample(value: number, timestamp?: number): void {
    const now = timestamp ?? performance.now();
    this.buffer.push(value);
    this.timestamps.push(now);

    if (this.buffer.length > this.maxBufferSize) {
      this.buffer.shift();
      this.timestamps.shift();
    }
  }

  /**
   * Return recent signal waveform for rendering
   */
  public getNormalizedSignal(): number[] {
    if (this.buffer.length < 10) return [];

    // Detrend and normalize buffer
    const mean = this.buffer.reduce((a, b) => a + b, 0) / this.buffer.length;
    const stdDev = Math.sqrt(
      this.buffer.reduce((sq, n) => sq + Math.pow(n - mean, 2), 0) / this.buffer.length
    ) || 1;

    return this.buffer.map((val) => (val - mean) / stdDev);
  }

  /**
   * Compute final biometrics after scanning session.
   * Respiration, blood pressure, and SpO2 are always null: this camera-based
   * scan cannot measure them.
   */
  public analyzeSession(): RPPGResult {
    const rawSignal = this.getNormalizedSignal();
    const pulse = this.estimatePulse(rawSignal);

    const heartRate = pulse ? pulse.bpm : 0;
    const heartRateConfidence: "high" | "low" = pulse
      ? pulse.peaks >= 3 ? "high" : "low"
      : "low";
    const hrv = pulse ? pulse.hrv : 0;

    let stressLevel: StressLevel = "Unknown";
    if (heartRate > 0) {
      if (heartRate > 90 || (hrv > 0 && hrv < 25)) {
        stressLevel = "High";
      } else if (heartRate > 80 || (hrv > 0 && hrv < 35)) {
        stressLevel = "Moderate";
      } else {
        stressLevel = "Low";
      }
    }

    let healthScore = 0;
    let riskLevel = "Unknown";
    if (heartRate > 0) {
      let score = 100;
      if (heartRate < 60 || heartRate > 100) score -= 15;
      if (stressLevel === "Moderate") score -= 10;
      if (stressLevel === "High") score -= 25;
      healthScore = Math.max(50, Math.min(100, score));

      riskLevel = healthScore < 70 || stressLevel === "High" ? "Moderate" : "Low";
      if (healthScore < 60) riskLevel = "High";
    }

    return {
      heartRate,
      heartRateConfidence,
      stressLevel,
      healthScore,
      riskLevel,
      respirationRate: null,
      bloodPressure: null,
      oxygenLevel: null,
      signalBuffer: rawSignal,
    };
  }

  /**
   * Heart rate from peak-to-peak (inter-beat interval) detection.
   * Returns null when no reliable pulse is found.
   */
  private estimatePulse(rawSignal: number[]): PulseEstimate | null {
    if (rawSignal.length <= 50) return null;

    const peaks: number[] = [];
    const threshold = 0.3;

    for (let i = 1; i < rawSignal.length - 1; i++) {
      if (
        rawSignal[i] > threshold &&
        rawSignal[i] > rawSignal[i - 1] &&
        rawSignal[i] > rawSignal[i + 1]
      ) {
        // Ensure minimum peak distance (~0.35s -> max 170 BPM)
        if (peaks.length === 0 || (i - peaks[peaks.length - 1]) > 10) {
          peaks.push(i);
        }
      }
    }

    if (peaks.length < 2) return null;

    // Estimate fps from real frame timing
    const durationSec = (this.timestamps[this.timestamps.length - 1] - this.timestamps[0]) / 1000;
    const fps = this.buffer.length / (durationSec || 1);

    const ibis: number[] = [];
    for (let i = 1; i < peaks.length; i++) {
      const frameDiff = peaks[i] - peaks[i - 1];
      const timeSec = frameDiff / fps;
      if (timeSec > 0.35 && timeSec < 1.4) {
        ibis.push(timeSec);
      }
    }

    if (ibis.length === 0) return null;

    const avgIbi = ibis.reduce((a, b) => a + b, 0) / ibis.length;
    let bpm = Math.round(60 / avgIbi);
    // Sanity clamp for biologically plausible heart rates; does not force "normal".
    bpm = Math.max(35, Math.min(200, bpm));

    let hrv = 0;
    if (ibis.length > 1) {
      const variance = ibis.reduce((sum, ibi) => sum + Math.pow(ibi - avgIbi, 2), 0) / ibis.length;
      hrv = Math.round(Math.sqrt(variance) * 1000);
    }

    return { bpm, hrv, peaks: ibis.length + 1 };
  }

  public reset() {
    this.buffer = [];
    this.timestamps = [];
  }
}
