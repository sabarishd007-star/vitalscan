import { describe, expect, it } from "vitest";
import { RPPGAnalyzer } from "./rppgEngine";

const SAMPLE_MS = 100; // 10 Hz

function pushSynthetic(
  analyzer: RPPGAnalyzer,
  seconds: number,
  options: { cardiacHz?: number; noiseAmp?: number } = {}
): void {
  const { cardiacHz = 0.9, noiseAmp = 0.02 } = options;
  const n = Math.round(seconds * 10);
  for (let i = 0; i < n; i++) {
    const t = i / 10;
    const cardiac = 5 * Math.sin(2 * Math.PI * cardiacHz * t);
    const noise = noiseAmp * Math.sin(2 * Math.PI * 13 * t + 1.7);
    analyzer.pushSample(100 + cardiac + noise, i * SAMPLE_MS);
  }
}

describe("RPPGAnalyzer honesty contract", () => {
  it("reports no measured vitals when there is no signal", () => {
    const analyzer = new RPPGAnalyzer();
    const result = analyzer.analyzeSession();

    expect(result.heartRate).toBe(0);
    expect(result.heartRateConfidence).toBe("low");
    expect(result.stressLevel).toBe("Unknown");
    expect(result.healthScore).toBe(0);
    expect(result.riskLevel).toBe("Unknown");
    expect(result.respirationRate).toBeNull();
    expect(result.bloodPressure).toBeNull();
    expect(result.oxygenLevel).toBeNull();
  });

  it("measures heart rate from a synthetic pulse and never fabricates BP, SpO2, or respiration", () => {
    const analyzer = new RPPGAnalyzer();
    pushSynthetic(analyzer, 12);

    const result = analyzer.analyzeSession();

    expect(result.heartRate).toBeGreaterThanOrEqual(45);
    expect(result.heartRate).toBeLessThanOrEqual(65);
    expect(result.heartRateConfidence).toBe("high");
    expect(result.stressLevel).not.toBe("Unknown");
    expect(result.healthScore).toBeGreaterThan(0);
    expect(result.respirationRate).toBeNull();
    expect(result.bloodPressure).toBeNull();
    expect(result.oxygenLevel).toBeNull();
  });

  it("does not report respiration even from a long, clean synthetic pulse", () => {
    const analyzer = new RPPGAnalyzer();
    pushSynthetic(analyzer, 30);

    const result = analyzer.analyzeSession();

    expect(result.heartRate).toBeGreaterThan(0);
    expect(result.respirationRate).toBeNull();
  });

  it("is fully deterministic (no random values injected)", () => {
    const build = () => {
      const analyzer = new RPPGAnalyzer();
      pushSynthetic(analyzer, 12);
      return analyzer.analyzeSession();
    };

    expect(build()).toEqual(build());
  });
});
