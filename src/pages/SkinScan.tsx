import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { validateImageQuality, type SkinAnalysisResult } from "../utils/skinEngine";
import { getFaceAlignment, getFaceMesh, type FaceAlignment, type FaceMeshData } from "../utils/faceLandmarker";
import { generateRecommendations } from "../utils/skinRecommendations";
import { useSkin } from "../context/SkinContext";
import { saveSkinReport, skinResultToReport } from "../services/skinReportService";
import { analyzeSkinOnServer } from "../services/skinAnalysisService";
import RealTimeSkinReport from "../components/RealTimeSkinReport";

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

  // Quality check states
  const [qualityResult, setQualityResult] = useState<ReturnType<typeof validateImageQuality> | null>(null);
  const [scanFeedback, setScanFeedback] = useState<string | null>(null);
  const [faceAlignment, setFaceAlignment] = useState<FaceAlignment | null>(null);
  const [mesh, setMesh] = useState<FaceMeshData>({ points: [], edges: [] });

  // Form inputs
  const [age, setAge] = useState("");
  const [sleepHours, setSleepHours] = useState("");
  const [waterIntake, setWaterIntake] = useState("");
  const [stressLevel, setStressLevel] = useState("");
  const [skinConcern, setSkinConcern] = useState("none");
  const [savedToDb, setSavedToDb] = useState<boolean | null>(null);

  const [skinResult, setSkinResult] = useState<SkinAnalysisResult | null>(null);
  const [capturedImageUrl, setCapturedImageUrl] = useState<string | null>(null);

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

  // Real-time quality validation check loop
  useEffect(() => {
    if (!cameraActive || scanning || scanComplete) return;
    const interval = setInterval(() => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (video && canvas && video.videoWidth > 0) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(video, 0, 0);
          const q = validateImageQuality(canvas);
          setQualityResult(q);
        }
      }
    }, 450);
    return () => clearInterval(interval);
  }, [cameraActive, scanning, scanComplete]);

  // MediaPipe Face Mesh validates the actual facial-landmark position, rather
  // than relying only on skin-colour pixels in the camera frame.
  useEffect(() => {
    if (!cameraActive || scanning || scanComplete) return;
    let cancelled = false;
    const interval = window.setInterval(() => {
      const video = videoRef.current;
      if (!video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;

      void Promise.all([
        getFaceAlignment(video, performance.now()),
        getFaceMesh(video, performance.now()),
      ])
        .then(([alignment, meshData]) => {
          if (cancelled) return;
          setFaceAlignment(alignment);
          setMesh(meshData);
        })
        .catch(() => {
          if (!cancelled) {
            setFaceAlignment(null);
            setMesh({ points: [], edges: [] });
          }
        });
    }, 700);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [cameraActive, scanning, scanComplete]);

  const captureIsReady = cameraActive;
  const qualityRecommended = Boolean(
    qualityResult?.isValid && faceAlignment?.detected && faceAlignment.centred && faceAlignment.level
  );

  const startScan = async () => {
    if (scanning || !cameraActive) return;
    setScanning(true);
    setScanComplete(false);
    setSkinResult(null);
    setCapturedImageUrl(null);
    setProgress(0);
    setCurrentStep(0);
    setSavedToDb(null);
    setScanFeedback(null);

    const ageNum = parseInt(age) || 25;
    const sleepNum = parseFloat(sleepHours) || 7;
    const waterNum = parseFloat(waterIntake) || 2;
    const stressNum = parseInt(stressLevel) || 4;

    // Start the API request immediately. The progress steps reflect live work
    // while it is in flight instead of adding a fixed eight-second delay.
    let step = 0;
    const timer = window.setInterval(() => {
      step = Math.min(step + 1, SCAN_STEPS.length - 1);
      setCurrentStep(step);
      setProgress(Math.min(92, Math.round(((step + 1) / SCAN_STEPS.length) * 92)));
    }, 450);

    let result: SkinAnalysisResult;
    try {
      result = await analyzeSkinOnServer(
        canvasRef.current!, videoRef.current!, ageNum, sleepNum, waterNum, stressNum, skinConcern
      );
    } catch (error) {
      window.clearInterval(timer);
      setScanning(false);
      setProgress(0);
      setScanFeedback(error instanceof Error ? error.message : "Unable to analyze this image. Please try again.");
      return;
    }
    window.clearInterval(timer);

    if (result.analysisConfidence < 40) {
      setScanning(false);
      setProgress(0);
      setScanFeedback("We could not get a reliable reading. Move into even lighting, keep your face centred, and try again.");
      return;
    }

    if (!result.localized_analysis) {
      result.localized_analysis = {
        primary_skin_type: result.skinType,
        metrics: {
          dark_circles: { score: Math.round(result.darkCircles * 10), max: 100, description: "Under-eye dark circle score" },
          open_pores: { score: Math.round(result.poreVisibility * 10), max: 100, description: "Pore visibility score" },
          texture: { score: Math.round(result.texture * 10), max: 100, description: "Skin roughness score" },
          redness: { score: Math.round(result.redness * 10), max: 100, description: "Visible redness score" },
          oiliness: { score: Math.round(result.oiliness * 10), max: 100, description: "T-Zone oiliness score" },
          dryness: { score: Math.round(result.dryness * 10), max: 100, description: "Flaky dryness score" },
        },
        bounding_regions: {
          dark_circles: { x: 0.25, y: 0.44, w: 0.50, h: 0.12 },
          open_pores: { x: 0.38, y: 0.42, w: 0.24, h: 0.22 },
          texture: { x: 0.20, y: 0.28, w: 0.60, h: 0.50 },
          redness: { x: 0.28, y: 0.48, w: 0.44, h: 0.25 },
          oiliness: { x: 0.30, y: 0.22, w: 0.40, h: 0.45 },
          dryness: { x: 0.18, y: 0.45, w: 0.64, h: 0.35 },
        }
      };
    }

    setCapturedImageUrl(canvasRef.current?.toDataURL("image/jpeg", 0.9) ?? null);
    const recs = generateRecommendations(result);
    setSkinResult(result);
    setSkinData({ result, recommendations: recs });

    try {
      const reportData = skinResultToReport(result, recs);
      const { error } = await saveSkinReport(reportData);
      setSavedToDb(!error);
      if (error) console.warn("Skin report save error:", error);
    } catch {
      setSavedToDb(false);
    }

    setCurrentStep(SCAN_STEPS.length - 1);
    setScanning(false);
    setScanComplete(true);
    setProgress(100);
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

            {/* Real-time Quality Indicators */}
            {cameraActive && !scanning && !scanComplete && (
              <div className="mt-4 p-4 rounded-2xl bg-white/5 border border-white/10 text-center text-xs">
                <p className="mb-3 text-white/60">Use even front lighting, face the camera directly, and remove filters or tinted glasses.</p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <div>
                  <p className="text-white/40 mb-1">💡 Lighting</p>
                  {!qualityResult ? (
                    <span className="text-white/60">⏳ Checking...</span>
                  ) : qualityResult.lighting.passed ? (
                    <span className="text-emerald-400 font-semibold">🟢 Good</span>
                  ) : (
                    <span className="text-amber-400 font-semibold">⚠️ {qualityResult.lighting.status}</span>
                  )}
                </div>
                <div>
                  <p className="text-white/40 mb-1">Face Mesh</p>
                  {!faceAlignment ? (
                    <span className="text-white/60">Checking...</span>
                  ) : faceAlignment.detected && faceAlignment.centred && faceAlignment.level ? (
                    <span className="text-emerald-400 font-semibold">Tracked</span>
                  ) : (
                    <span className="text-amber-400 font-semibold">Face forward</span>
                  )}
                </div>
                <div>
                  <p className="text-white/40 mb-1">🔍 Sharpness</p>
                  {!qualityResult ? (
                    <span className="text-white/60">⏳ Checking...</span>
                  ) : qualityResult.blur.passed ? (
                    <span className="text-emerald-400 font-semibold">🟢 Sharp</span>
                  ) : (
                    <span className="text-red-400 font-semibold">🔴 Blurry</span>
                  )}
                </div>
                <div>
                  <p className="text-white/40 mb-1">👤 Alignment</p>
                  {!qualityResult ? (
                    <span className="text-white/60">⏳ Checking...</span>
                  ) : qualityResult.faceCentering.passed ? (
                    <span className="text-emerald-400 font-semibold">🟢 Centered</span>
                  ) : (
                    <span className="text-amber-400 font-semibold">⚠️ Align Face</span>
                  )}
                </div>
                </div>
              </div>
            )}

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
                  <option value="blackheads" className="bg-slate-800">Blackheads / Whiteheads</option>
                  <option value="oily" className="bg-slate-800">Oily / Shiny Skin</option>
                  <option value="dry" className="bg-slate-800">Dry / Flaky Skin</option>
                  <option value="combination" className="bg-slate-800">Combination Skin</option>
                  <option value="sensitive" className="bg-slate-800">Sensitive / Redness</option>
                  <option value="darkCircles" className="bg-slate-800">Dark Circles</option>
                  <option value="pigmentation" className="bg-slate-800">Dark Spots / Pigmentation</option>
                  <option value="melasma" className="bg-slate-800">Melasma</option>
                  <option value="tanning" className="bg-slate-800">Tanning / Sun Damage</option>
                  <option value="enlargedPores" className="bg-slate-800">Enlarged Pores</option>
                  <option value="texture" className="bg-slate-800">Uneven Texture</option>
                  <option value="dullness" className="bg-slate-800">Dullness / Lack of Radiance</option>
                  <option value="acneScars" className="bg-slate-800">Acne Scars / Marks</option>
                  <option value="aging" className="bg-slate-800">Ageing / Fine Lines</option>
                  <option value="puffiness" className="bg-slate-800">Under-eye Puffiness</option>
                  <option value="dehydration" className="bg-slate-800">Dehydration</option>
                  <option value="milia" className="bg-slate-800">Milia</option>
                  <option value="sunburn" className="bg-slate-800">Sunburn / Irritation</option>
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
              disabled={scanning || !cameraActive || !captureIsReady}
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

            {!qualityRecommended && cameraActive && !scanning && !scanComplete && (
              <div className="mt-3 text-center">
                <p className="text-white/50 text-xs mb-1.5">💡 Tip: For optimal accuracy, keep your face centered in good lighting.</p>
              </div>
            )}

            {scanFeedback && (
              <p className="mt-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-center text-xs text-amber-200">{scanFeedback}</p>
            )}

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

            {skinResult.localized_analysis && capturedImageUrl && (
              <RealTimeSkinReport result={skinResult} imageUrl={capturedImageUrl} mesh={mesh} />
            )}

            {/* Server-provided, user-facing 0–100 metric contract */}
            {skinResult.metrics && (
              <div className="rounded-3xl border border-white/20 bg-white/10 p-6 shadow-2xl">
                <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="text-xl font-bold text-white">Skin Health Breakdown</h2>
                  <p className="text-sm text-white/60">
                    Overall score: <span className="font-bold text-white">{skinResult.overall_score ?? Math.round(skinResult.overallScore * 10)}/100</span>
                  </p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {Object.entries(skinResult.metrics).map(([key, metric]) => (
                    <div key={key} className="rounded-2xl border border-white/15 bg-slate-950/30 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <h3 className="capitalize font-semibold text-white">{key}</h3>
                        <span className="rounded-full bg-pink-500/20 px-2 py-1 text-xs font-bold text-pink-200">{metric.score}/100</span>
                      </div>
                      <p className="mt-2 text-sm font-medium text-emerald-300">{metric.status}</p>
                      <p className="mt-1 text-xs leading-relaxed text-white/60">{metric.description}</p>
                    </div>
                  ))}
                </div>
                {skinResult.disclaimer && (
                  <p className="mt-5 border-t border-white/10 pt-4 text-center text-xs italic leading-relaxed text-white/50">
                    {skinResult.disclaimer}
                  </p>
                )}
              </div>
            )}

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
