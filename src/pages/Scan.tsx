import { useState, useRef, useEffect } from "react";
import { useHealth } from "../context/HealthContext";
import { saveReport } from "../services/reportService";
import { RPPGAnalyzer } from "../utils/rppgEngine";

export default function Scan() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const [status, setStatus] = useState("Ready to Scan");
  const [progress, setProgress] = useState(0);
  const [heartRate, setHeartRate] = useState("--");
  const [respirationRate, setRespirationRate] = useState("--");
  const [healthScore, setHealthScore] = useState("--");
  const [risk, setRisk] = useState("Unknown");
  const [loading, setLoading] = useState(false);

  // Form inputs
  const [age, setAge] = useState("");
  const [sleepHours, setSleepHours] = useState("");
  const [userStress, setUserStress] = useState("");

  const { setHealthData } = useHealth();
  const analyzerRef = useRef<RPPGAnalyzer>(new RPPGAnalyzer());

  // Initialize Camera Stream on Mount
  useEffect(() => {
    let stream: MediaStream | null = null;

    async function enableCamera() {
      try {
        setCameraError(null);
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 1280 },
            height: { ideal: 720 },
            facingMode: "user",
          },
          audio: false,
        });

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.onloadedmetadata = () => {
            videoRef.current?.play().catch((e) => console.error(e));
            setCameraActive(true);
          };
        }
      } catch (err: unknown) {
        console.error("Camera Access Error:", err);
        setCameraError("Camera access denied or device in use. Please allow camera permissions in browser.");
      }
    }

    enableCamera();

    return () => {
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  const startScan = async () => {
    if (!cameraActive && !videoRef.current) {
      alert("Camera is not active. Please allow browser camera access.");
      return;
    }

    setLoading(true);
    setProgress(0);
    analyzerRef.current.reset();

    const messages = [
      "🤖 Initializing AI Vision...",
      "📷 Detecting Face & Skin ROI...",
      "❤️ Measuring Heart Rate (rPPG)...",
      "🫀 Analyzing Heart Rate Variability...",
      "📋 Compiling Scan Results...",
      "📊 Generating AI Health Report...",
    ];

    let step = 0;

    // Process frames during scan
    const frameInterval = setInterval(() => {
      if (videoRef.current && canvasRef.current && videoRef.current.readyState === 4) {
        analyzerRef.current.processFrame(canvasRef.current, videoRef.current);
      }
    }, 100);

    const timer = setInterval(async () => {
      step++;
      const currentProgress = Math.min(100, Math.round((step / messages.length) * 100));
      setProgress(currentProgress);

      if (step < messages.length) {
        setStatus(messages[step]);
      }

      if (step >= messages.length) {
        clearInterval(timer);
        clearInterval(frameInterval);

        // Analyze captured frames
        const result = analyzerRef.current.analyzeSession();

        // Incorporate form inputs if available
        let calculatedScore = result.healthScore;
        let calculatedRisk = result.riskLevel;

        const ageNum = parseInt(age);
        if (calculatedScore > 0 && !isNaN(ageNum) && ageNum > 60) {
          calculatedScore = Math.max(50, calculatedScore - 5);
        }
        const sleepNum = parseInt(sleepHours);
        if (calculatedScore > 0 && !isNaN(sleepNum) && sleepNum < 6) {
          calculatedScore = Math.max(50, calculatedScore - 10);
        }
        const stressNum = parseInt(userStress);
        if (!isNaN(stressNum) && stressNum > 7) {
          calculatedRisk = "High";
        }

        const report = {
          heart_rate: result.heartRate,
          blood_pressure: result.bloodPressure,
          oxygen_level: result.oxygenLevel,
          respiration_rate: result.respirationRate,
          health_score: calculatedScore,
          risk_level: calculatedRisk,
          stress_level: result.stressLevel,
        };

        try {
          const { error } = await saveReport(report);
          if (error) {
            console.error("Failed to save report to Supabase:", error);
            alert("Scan Completed! (Note: Supabase error: " + error.message + ")");
          } else {
            alert("Health Report Saved Successfully to Supabase!");
          }
        } catch (err: unknown) {
          console.error(err);
          const message = err instanceof Error ? ` (${err.message})` : "";
          alert(`Scan Completed!${message}`);
        } finally {
          setHeartRate(result.heartRate > 0 ? `${result.heartRate} BPM` : "—");
          setRespirationRate(result.respirationRate ? `${result.respirationRate} bpm` : "Not measured");
          setHealthScore(calculatedScore > 0 ? `${calculatedScore}%` : "—");
          setRisk(calculatedRisk);
          setStatus("✅ AI Scan Completed");
          setProgress(100);

          setHealthData({
            heartRate: result.heartRate > 0 ? result.heartRate : null,
            bloodPressure: result.bloodPressure,
            oxygen: result.oxygenLevel,
            respirationRate: result.respirationRate,
            stress: result.stressLevel,
            healthScore: calculatedScore > 0 ? calculatedScore : null,
            risk: calculatedRisk,
          });

          setLoading(false);
        }
      }
    }, 1000);
  };

  return (
    <div className="min-h-screen bg-gradient-to-r from-blue-50 to-cyan-100 p-6 md:p-10">
      <h1 className="text-4xl md:text-5xl font-bold text-center text-blue-700 mb-8">
        AI Health Scan
      </h1>

      <div className="mx-auto mb-8 max-w-4xl rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-center text-sm text-amber-900">
        <strong>Demo only:</strong> VitalScan is a wellness prototype, not a medical device. Do not use these estimates to diagnose, treat, or make medical decisions. A camera cannot measure blood pressure or blood oxygen (SpO2); those vitals are never reported here.
      </div>

      <div className="grid md:grid-cols-2 gap-8">
        {/* Live Camera Feed Card */}
        <div className="bg-white rounded-3xl shadow-xl p-6">
          <h2 className="text-2xl font-bold mb-4 text-gray-800 flex items-center justify-between">
            <span>📷 Live Camera</span>
            {cameraActive ? (
              <span className="text-xs font-semibold px-3 py-1 bg-green-100 text-green-700 rounded-full flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-green-500 animate-ping" /> Camera Active
              </span>
            ) : (
              <span className="text-xs font-semibold px-3 py-1 bg-amber-100 text-amber-700 rounded-full">
                Connecting Camera...
              </span>
            )}
          </h2>

          <div className="overflow-hidden rounded-2xl border-4 border-green-500 h-96 relative bg-slate-950 flex items-center justify-center">
            {cameraError ? (
              <div className="p-6 text-center text-amber-400 font-medium">
                <p className="text-3xl mb-2">⚠️</p>
                <p>{cameraError}</p>
                <button
                  onClick={() => window.location.reload()}
                  className="mt-4 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold px-4 py-2 rounded-xl transition"
                >
                  Reload Page & Allow Camera
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

            {/* Face Tracking Bounding Box Overlay */}
            {cameraActive && (
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                <div
                  className={`w-56 h-72 border-2 rounded-2xl transition-all duration-300 relative ${
                    loading
                      ? "border-green-400 shadow-[0_0_25px_rgba(74,222,128,0.6)]"
                      : "border-green-500/70 border-dashed"
                  }`}
                >
                  {/* Corner Accents */}
                  <div className="absolute -top-2 -left-2 w-6 h-6 border-t-4 border-l-4 border-green-500 rounded-tl-lg" />
                  <div className="absolute -top-2 -right-2 w-6 h-6 border-t-4 border-r-4 border-green-500 rounded-tr-lg" />
                  <div className="absolute -bottom-2 -left-2 w-6 h-6 border-b-4 border-l-4 border-green-500 rounded-bl-lg" />
                  <div className="absolute -bottom-2 -right-2 w-6 h-6 border-b-4 border-r-4 border-green-500 rounded-br-lg" />

                  {/* Status Badge inside box */}
                  <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-black/70 text-green-400 text-xs px-3 py-1 rounded-full font-semibold backdrop-blur whitespace-nowrap">
                    {loading ? "Analyzing Face Pixels..." : "Position Face Here"}
                  </div>

                  {/* Laser Scanning Line when loading */}
                  {loading && (
                    <div className="absolute w-full h-1 bg-gradient-to-r from-transparent via-green-400 to-transparent shadow-[0_0_12px_#4ade80] animate-bounce top-1/3" />
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Health Information Form */}
        <div className="bg-white rounded-3xl shadow-xl p-6">
          <h2 className="text-2xl font-bold mb-6 text-gray-800">
            Health Information
          </h2>

          <input
            type="number"
            placeholder="Age"
            value={age}
            onChange={(e) => setAge(e.target.value)}
            className="w-full p-4 border rounded-xl mb-4 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />

          <input
            type="number"
            placeholder="Sleep Hours"
            value={sleepHours}
            onChange={(e) => setSleepHours(e.target.value)}
            className="w-full p-4 border rounded-xl mb-4 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />

          <input
            type="number"
            placeholder="Stress Level (1-10)"
            value={userStress}
            onChange={(e) => setUserStress(e.target.value)}
            className="w-full p-4 border rounded-xl mb-4 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />

          <input
            type="file"
            className="w-full p-4 border rounded-xl mb-6 text-gray-600"
          />

          <button
            onClick={startScan}
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white text-xl font-bold rounded-xl py-4 transition shadow-lg disabled:opacity-60"
          >
            {loading ? "Scanning Face..." : "Start AI Scan"}
          </button>

          {loading && (
            <div className="mt-6">
              <p className="font-semibold text-blue-600">
                {status}
              </p>

              <div className="w-full bg-gray-200 rounded-full mt-3 h-4 overflow-hidden">
                <div
                  className="bg-green-500 h-full transition-all duration-500"
                  style={{ width: `${progress}%` }}
                />
              </div>

              <p className="mt-3 font-semibold text-blue-700">{status}</p>
              <p className="text-gray-600 text-sm">{progress}% Completed</p>
            </div>
          )}
        </div>
      </div>

      {/* AI Analysis Results Section */}
      <div className="bg-white rounded-3xl shadow-xl mt-10 p-8">
        <h2 className="text-3xl font-bold mb-6 text-gray-800">
          AI Analysis Results
        </h2>

        <div className="grid md:grid-cols-5 gap-6">
          <div className="bg-blue-100 rounded-xl p-6 text-center shadow-sm">
            <h3 className="text-xl font-bold text-blue-800">
              ❤️ Heart Rate
            </h3>
            <p className="text-3xl font-extrabold text-blue-900 mt-4">
              {heartRate}
            </p>
          </div>

          <div className="bg-green-100 rounded-xl p-6 text-center shadow-sm">
            <h3 className="text-xl font-bold text-green-800">
              📊 Health Score
            </h3>
            <p className="text-3xl font-extrabold text-green-900 mt-4">
              {healthScore}
            </p>
          </div>

          <div className="bg-yellow-100 rounded-xl p-6 text-center shadow-sm">
            <h3 className="text-xl font-bold text-yellow-800">
              ⚠️ Risk Level
            </h3>
            <p className="text-3xl font-extrabold text-yellow-900 mt-4">
              {risk}
            </p>
          </div>

          <div className="bg-purple-100 rounded-xl p-6 text-center shadow-sm">
            <h3 className="text-xl font-bold text-purple-800">
              🫁 Respiration
            </h3>
            <p className="text-3xl font-extrabold text-purple-900 mt-4">
              {respirationRate}
            </p>
          </div>

          <div className="bg-red-100 rounded-xl p-6 text-center shadow-sm">
            <h3 className="text-xl font-bold text-red-800">
              🤖 AI Progress
            </h3>
            <p className="text-3xl font-extrabold text-red-900 mt-4">
              {progress}%
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
