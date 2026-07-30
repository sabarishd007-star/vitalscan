import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { analyzeSkinFromFrame } from "../utils/skinEngine";
import { generateRecommendations } from "../utils/skinRecommendations";
import { useSkin } from "../context/SkinContext";
import { saveSkinReport, skinResultToReport } from "../services/skinReportService";

const SCAN_STEPS = [
  { emoji: "🤖", text: "Initializing AI Vision Engine..." },
  { emoji: "📷", text: "Detecting Face & Skin Region..." },
  { emoji: "🔬", text: "Analyzing Skin Tone & Texture..." },
  { emoji: "💧", text: "Measuring Hydration & Oiliness..." },
  { emoji: "🔴", text: "Detecting Redness & Acne Visibility..." },
  { emoji: "🌑", text: "Assessing Dark Circles & Pigmentation..." },
  { emoji: "✨", text: "Calculating Glow Score & Pore Visibility..." },
  { emoji: "📊", text: "Generating Personalized Skin Report..." },
];

const METRIC_LABELS: Record<string, string> = {
  acneLevel: "Acne Level",
  darkCircles: "Dark Circles",
  oiliness: "Oiliness",
  dryness: "Dryness",
  redness: "Redness",
  poreVisibility: "Pore Visibility",
  pigmentation: "Pigmentation",
  texture: "Texture (Roughness)",
  glowScore: "Glow Score",
  hydration: "Hydration",
};

function getScoreColor(value: number, invertedMetric = false): string {
  const effective = invertedMetric ? value : 10 - value;
  if (effective < 3) return "from-red-500 to-rose-500";
  if (effective < 5) return "from-orange-400 to-amber-500";
  if (effective < 7) return "from-yellow-400 to-lime-400";
  return "from-emerald-400 to-teal-400";
}

function getScoreBg(value: number, invertedMetric = false): string {
  const effective = invertedMetric ? value : 10 - value;
  if (effective < 3) return "bg-red-50 border-red-200";
  if (effective < 5) return "bg-orange-50 border-orange-200";
  if (effective < 7) return "bg-yellow-50 border-yellow-200";
  return "bg-emerald-50 border-emerald-200";
}

function getScoreLabel(value: number, invertedMetric = false): string {
  const effective = invertedMetric ? value : 10 - value;
  if (effective < 3) return "Needs Attention";
  if (effective < 5) return "Fair";
  if (effective < 7) return "Good";
  return "Excellent";
}

export default function SkinScan() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const navigate = useNavigate();
  const { setSkinData } = useSkin();

  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanComplete, setScanComplete] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [progress, setProgress] = useState(0);

  // Form inputs
  const [age, setAge] = useState("");
  const [sleepHours, setSleepHours] = useState("");
  const [waterIntake, setWaterIntake] = useState("");
  const [stressLevel, setStressLevel] = useState("");
  const [skinConcern, setSkinConcern] = useState("none");
  const [savedToDb, setSavedToDb] = useState<boolean | null>(null);

  const [skinResult, setSkinResult] = useState<ReturnType<typeof analyzeSkinFromFrame> | null>(null);

  // Camera init
  useEffect(() => {
    let stream: MediaStream | null = null;
    async function enableCamera() {
      try {
        setCameraError(null);
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" },
          audio: false,
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.onloadedmetadata = () => {
            videoRef.current?.play().catch(console.error);
            setCameraActive(true);
          };
        }
      } catch {
        setCameraError("Camera access denied. Please allow camera permissions in your browser settings.");
      }
    }
    enableCamera();
    return () => { if (stream) stream.getTracks().forEach((t) => t.stop()); };
  }, []);

  const startScan = async () => {
    if (scanning) return;
    setScanning(true);
    setScanComplete(false);
    setSkinResult(null);
    setProgress(0);
    setCurrentStep(0);
    setSavedToDb(null);

    const ageNum = parseInt(age) || 25;
    const sleepNum = parseFloat(sleepHours) || 7;
    const waterNum = parseFloat(waterIntake) || 2;
    const stressNum = parseInt(stressLevel) || 4;

    let step = 0;
    const timer = setInterval(async () => {
      step++;
      setCurrentStep(step - 1);
      setProgress(Math.min(100, Math.round((step / SCAN_STEPS.length) * 100)));

      if (step >= SCAN_STEPS.length) {
        clearInterval(timer);

        // Run skin analysis
        const result = analyzeSkinFromFrame(
          canvasRef.current!,
          videoRef.current!,
          ageNum, sleepNum, waterNum, stressNum, skinConcern
        );
        const recs = generateRecommendations(result);
        setSkinResult(result);
        setSkinData({ result, recommendations: recs });

        // Save to Supabase
        try {
          const reportData = skinResultToReport(result, recs);
          const { error } = await saveSkinReport(reportData);
          setSavedToDb(!error);
          if (error) console.warn("Skin report save error:", error);
        } catch {
          setSavedToDb(false);
        }

        setScanning(false);
        setScanComplete(true);
        setProgress(100);
      }
    }, 900);
  };

  const overallScoreColor =
    skinResult && skinResult.overallScore >= 7.5
      ? "#22c55e"
      : skinResult && skinResult.overallScore >= 5
      ? "#f59e0b"
      : "#ef4444";

  return (
    <div className="min-h-screen" style={{ background: "linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%)" }}>
      {/* Header */}
      <div className="text-center pt-10 pb-6 px-4">
        <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-md border border-white/20 rounded-full px-5 py-2 mb-4">
          <span className="text-pink-400 text-sm font-semibold">✨ AI-Powered</span>
        </div>
        <h1 className="text-4xl md:text-5xl font-extrabold text-white mb-3">
          AI SkinCare Analyzer
        </h1>
        <p className="text-white/60 text-lg max-w-xl mx-auto">
          Real-time facial skin analysis with personalized skincare recommendations
        </p>
        <div className="mt-4 inline-block bg-amber-900/40 border border-amber-500/40 text-amber-300 text-xs px-4 py-2 rounded-full">
          ⚠️ AI-estimated cosmetic guidance only — not a medical diagnosis
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 pb-10">
        <div className="grid md:grid-cols-2 gap-6">

          {/* Camera Card */}
          <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-3xl p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-white font-bold text-xl">📷 Live Camera Feed</h2>
              <span className={`text-xs font-semibold px-3 py-1 rounded-full flex items-center gap-1.5 ${cameraActive ? "bg-green-500/20 text-green-400 border border-green-500/30" : "bg-amber-500/20 text-amber-400 border border-amber-500/30"}`}>
                <span className={`w-2 h-2 rounded-full ${cameraActive ? "bg-green-400 animate-ping" : "bg-amber-400"}`} />
                {cameraActive ? "Camera Active" : "Connecting..."}
              </span>
            </div>

            <div className="relative rounded-2xl overflow-hidden h-80 bg-black/50 border border-white/10 flex items-center justify-center">
              {cameraError ? (
                <div className="text-center px-6">
                  <p className="text-4xl mb-3">📵</p>
                  <p className="text-amber-400 font-medium text-sm">{cameraError}</p>
                  <button
                    onClick={() => window.location.reload()}
                    className="mt-4 bg-pink-600 hover:bg-pink-700 text-white text-sm font-bold px-4 py-2 rounded-xl transition"
                  >
                    Reload & Allow Camera
                  </button>
                </div>
              ) : (
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover transform -scale-x-100"
                />
              )}

              <canvas ref={canvasRef} className="hidden" />

              {/* Face tracking overlay */}
              {cameraActive && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className={`w-52 h-64 rounded-2xl relative transition-all duration-300 ${scanning ? "border-2 border-pink-400 shadow-[0_0_30px_rgba(236,72,153,0.5)]" : "border-2 border-dashed border-white/40"}`}>
                    <div className="absolute -top-1 -left-1 w-5 h-5 border-t-4 border-l-4 border-pink-400 rounded-tl-lg" />
                    <div className="absolute -top-1 -right-1 w-5 h-5 border-t-4 border-r-4 border-pink-400 rounded-tr-lg" />
                    <div className="absolute -bottom-1 -left-1 w-5 h-5 border-b-4 border-l-4 border-pink-400 rounded-bl-lg" />
                    <div className="absolute -bottom-1 -right-1 w-5 h-5 border-b-4 border-r-4 border-pink-400 rounded-br-lg" />
                    <div className="absolute top-2 left-1/2 -translate-x-1/2 bg-black/70 text-pink-400 text-xs px-3 py-1 rounded-full font-semibold backdrop-blur whitespace-nowrap">
                      {scanning ? "🔬 Analyzing Skin..." : "Position Your Face Here"}
                    </div>
                    {scanning && (
                      <div className="absolute w-full h-0.5 bg-gradient-to-r from-transparent via-pink-400 to-transparent shadow-[0_0_12px_#ec4899] animate-bounce top-1/3" />
                    )}
                  </div>
                </div>
              )}

              {/* Scan progress overlay */}
              {scanning && (
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 to-transparent p-4">
                  <p className="text-pink-400 text-sm font-semibold text-center mb-2">
                    {SCAN_STEPS[Math.min(currentStep, SCAN_STEPS.length - 1)].emoji}{" "}
                    {SCAN_STEPS[Math.min(currentStep, SCAN_STEPS.length - 1)].text}
                  </p>
                  <div className="w-full bg-white/20 rounded-full h-2 overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-pink-500 to-violet-500 rounded-full transition-all duration-700"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <p className="text-white/60 text-xs text-center mt-1">{progress}% Complete</p>
                </div>
              )}
            </div>

            {/* Scan step indicators */}
            <div className="mt-4 flex justify-between">
              {SCAN_STEPS.map((s, i) => (
                <div
                  key={i}
                  className={`text-lg transition-all duration-300 ${scanning && i <= currentStep ? "opacity-100 scale-110" : "opacity-30"}`}
                  title={s.text}
                >
                  {s.emoji}
                </div>
              ))}
            </div>
          </div>

          {/* Input Form */}
          <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-3xl p-6 shadow-2xl">
            <h2 className="text-white font-bold text-xl mb-5">🧬 Your Skin Profile</h2>

            <div className="space-y-4">
              <div>
                <label className="block text-white/70 text-sm font-medium mb-1.5">Age</label>
                <input
                  type="number"
                  placeholder="e.g. 24"
                  value={age}
                  onChange={(e) => setAge(e.target.value)}
                  className="w-full bg-white/10 border border-white/20 text-white placeholder-white/30 rounded-xl px-4 py-3 focus:outline-none focus:border-pink-500 focus:ring-1 focus:ring-pink-500 transition"
                />
              </div>

              <div>
                <label className="block text-white/70 text-sm font-medium mb-1.5">Main Skin Concern</label>
                <select
                  value={skinConcern}
                  onChange={(e) => setSkinConcern(e.target.value)}
                  className="w-full bg-white/10 border border-white/20 text-white rounded-xl px-4 py-3 focus:outline-none focus:border-pink-500 focus:ring-1 focus:ring-pink-500 transition"
                >
                  <option value="none" className="bg-slate-800">No specific concern</option>
                  <option value="acne" className="bg-slate-800">Acne & Breakouts</option>
                  <option value="oily" className="bg-slate-800">Oily / Shiny Skin</option>
                  <option value="dry" className="bg-slate-800">Dry / Flaky Skin</option>
                  <option value="sensitive" className="bg-slate-800">Sensitive / Redness</option>
                  <option value="darkCircles" className="bg-slate-800">Dark Circles</option>
                  <option value="pigmentation" className="bg-slate-800">Dark Spots / Pigmentation</option>
                  <option value="aging" className="bg-slate-800">Ageing / Fine Lines</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-white/70 text-sm font-medium mb-1.5">Sleep Hours/Night</label>
                  <input
                    type="number"
                    placeholder="e.g. 7"
                    value={sleepHours}
                    onChange={(e) => setSleepHours(e.target.value)}
                    className="w-full bg-white/10 border border-white/20 text-white placeholder-white/30 rounded-xl px-4 py-3 focus:outline-none focus:border-pink-500 focus:ring-1 focus:ring-pink-500 transition"
                  />
                </div>
                <div>
                  <label className="block text-white/70 text-sm font-medium mb-1.5">Water Intake (L/day)</label>
                  <input
                    type="number"
                    placeholder="e.g. 2.5"
                    step="0.5"
                    value={waterIntake}
                    onChange={(e) => setWaterIntake(e.target.value)}
                    className="w-full bg-white/10 border border-white/20 text-white placeholder-white/30 rounded-xl px-4 py-3 focus:outline-none focus:border-pink-500 focus:ring-1 focus:ring-pink-500 transition"
                  />
                </div>
              </div>

              <div>
                <label className="block text-white/70 text-sm font-medium mb-1.5">Stress Level (1–10)</label>
                <input
                  type="range"
                  min="1"
                  max="10"
                  value={stressLevel || "4"}
                  onChange={(e) => setStressLevel(e.target.value)}
                  className="w-full accent-pink-500"
                />
                <div className="flex justify-between text-white/40 text-xs mt-1">
                  <span>1 Relaxed</span>
                  <span className="text-pink-400 font-semibold">{stressLevel || "4"}/10</span>
                  <span>10 Very Stressed</span>
                </div>
              </div>
            </div>

            <button
              onClick={startScan}
              disabled={scanning}
              className="mt-6 w-full py-4 rounded-2xl font-bold text-white text-lg transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                background: scanning ? "rgba(236,72,153,0.3)" : "linear-gradient(135deg, #ec4899, #8b5cf6)",
                boxShadow: scanning ? "none" : "0 0 30px rgba(236,72,153,0.4)",
              }}
            >
              {scanning ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Analyzing Your Skin...
                </span>
              ) : (
                "✨ Start AI Skin Analysis"
              )}
            </button>

            {scanComplete && (
              <div className="mt-4 flex gap-3">
                <button
                  onClick={() => navigate("/skin-dashboard")}
                  className="flex-1 py-3 rounded-xl font-bold text-white text-sm transition"
                  style={{ background: "linear-gradient(135deg, #06b6d4, #3b82f6)" }}
                >
                  📊 View Full Dashboard
                </button>
                <button
                  onClick={() => navigate("/skin-report")}
                  className="flex-1 py-3 rounded-xl font-bold text-white text-sm transition"
                  style={{ background: "linear-gradient(135deg, #10b981, #14b8a6)" }}
                >
                  📋 View Report
                </button>
              </div>
            )}

            {savedToDb === true && (
              <p className="text-emerald-400 text-xs text-center mt-2">✅ Scan saved to your history</p>
            )}
            {savedToDb === false && (
              <p className="text-amber-400 text-xs text-center mt-2">⚠️ Could not save — Supabase table may not be set up yet</p>
            )}
          </div>
        </div>

        {/* Results Section */}
        {scanComplete && skinResult && (
          <div className="mt-8 space-y-6">
            {/* Overall Score Hero */}
            <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-3xl p-8 text-center shadow-2xl">
              <h2 className="text-white/70 text-sm font-semibold uppercase tracking-widest mb-3">Overall Skin Score</h2>
              <div className="relative inline-flex items-center justify-center">
                <svg width="160" height="160" className="-rotate-90">
                  <circle cx="80" cy="80" r="65" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="12" />
                  <circle
                    cx="80" cy="80" r="65" fill="none"
                    stroke={overallScoreColor}
                    strokeWidth="12"
                    strokeDasharray={`${(skinResult.overallScore / 10) * 408} 408`}
                    strokeLinecap="round"
                    style={{ filter: `drop-shadow(0 0 10px ${overallScoreColor})`, transition: "stroke-dasharray 1s ease" }}
                  />
                </svg>
                <div className="absolute text-center">
                  <p className="text-5xl font-extrabold text-white">{skinResult.overallScore}</p>
                  <p className="text-white/50 text-sm">/10</p>
                </div>
              </div>
              <div className="mt-4 flex items-center justify-center gap-3">
                <span className="text-3xl font-bold px-4 py-1 rounded-full text-white" style={{ background: overallScoreColor + "33", border: `1px solid ${overallScoreColor}44` }}>
                  {skinResult.skinType} Skin
                </span>
              </div>
              <p className="text-white/50 text-sm mt-2">
                {skinResult.overallScore >= 7.5 ? "🌟 Your skin is in great condition! Keep up your routine." : skinResult.overallScore >= 5 ? "👍 Your skin is fair — targeted treatments will help." : "⚠️ Your skin needs attention — follow the personalized guide below."}
              </p>
            </div>

            {/* 12 Metric Cards */}
            <div>
              <h2 className="text-white font-bold text-2xl mb-4">📊 Detailed Skin Metrics</h2>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                {Object.entries(METRIC_LABELS).map(([key, label]) => {
                  const value = skinResult[key as keyof typeof skinResult] as number;
                  const isGlowOrHydration = key === "glowScore" || key === "hydration";
                  const isGoodWhenHigh = isGlowOrHydration;
                  const bgClass = isGoodWhenHigh
                    ? (value >= 7 ? "bg-emerald-50 border-emerald-200" : value >= 5 ? "bg-yellow-50 border-yellow-200" : "bg-red-50 border-red-200")
                    : getScoreBg(value);
                  const barClass = isGoodWhenHigh
                    ? (value >= 7 ? "from-emerald-400 to-teal-400" : value >= 5 ? "from-yellow-400 to-lime-400" : "from-red-500 to-rose-500")
                    : getScoreColor(value);
                  const statusLabel = isGoodWhenHigh
                    ? (value >= 7 ? "Excellent" : value >= 5 ? "Good" : "Needs Attention")
                    : getScoreLabel(value);

                  return (
                    <div key={key} className={`rounded-2xl p-4 border ${bgClass} shadow-sm`}>
                      <p className="text-xs font-semibold text-gray-500 mb-1">{label}</p>
                      <p className="text-3xl font-extrabold text-gray-800">{value}</p>
                      <p className="text-xs text-gray-500 mb-2">/10</p>
                      <div className="w-full bg-gray-200 rounded-full h-1.5 overflow-hidden">
                        <div
                          className={`h-full bg-gradient-to-r ${barClass} rounded-full transition-all duration-1000`}
                          style={{ width: `${value * 10}%` }}
                        />
                      </div>
                      <p className="text-xs font-medium mt-1 text-gray-600">{statusLabel}</p>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Quick Tip Banner */}
            <div className="bg-gradient-to-r from-pink-600/20 to-violet-600/20 border border-pink-500/30 rounded-2xl p-5 flex items-center gap-4">
              <span className="text-3xl">💡</span>
              <div>
                <p className="text-white font-bold">
                  {skinResult.skinType === "Oily"
                    ? "For Oily Skin: Niacinamide 10% is your #1 serum — it regulates sebum in 2–4 weeks."
                    : skinResult.skinType === "Dry"
                    ? "For Dry Skin: Apply moisturizer within 3 minutes of washing to lock in hydration."
                    : skinResult.skinType === "Sensitive"
                    ? "For Sensitive Skin: Switch to fragrance-free, dye-free products across your entire routine."
                    : skinResult.acneLevel > 5
                    ? "For Acne: Use BHA (salicylic acid) exfoliant 2–3x per week and never pop pimples."
                    : "Maintain your current routine and add SPF30+ daily for long-term skin health."}
                </p>
                <p className="text-white/60 text-sm mt-1">See the full Dashboard for your complete personalized routine →</p>
              </div>
            </div>

            {/* CTA Buttons */}
            <div className="flex flex-wrap gap-4 justify-center">
              <button
                onClick={() => navigate("/skin-dashboard")}
                className="px-8 py-4 rounded-2xl font-bold text-white text-lg transition-all"
                style={{ background: "linear-gradient(135deg, #ec4899, #8b5cf6)", boxShadow: "0 0 30px rgba(236,72,153,0.4)" }}
              >
                📊 Full Dashboard & Recommendations
              </button>
              <button
                onClick={() => navigate("/skin-report")}
                className="px-8 py-4 rounded-2xl font-bold text-white text-lg transition-all bg-white/10 border border-white/20 hover:bg-white/20"
              >
                📋 Download Report (PDF)
              </button>
              <button
                onClick={() => navigate("/skin-history")}
                className="px-8 py-4 rounded-2xl font-bold text-white text-lg transition-all bg-white/10 border border-white/20 hover:bg-white/20"
              >
                📈 View History
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
