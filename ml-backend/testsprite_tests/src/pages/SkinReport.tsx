import { Link } from "react-router-dom";
import { jsPDF } from "jspdf";
import { useSkin } from "../context/SkinContext";

function MetricRow({ label, value, max = 10 }: { label: string; value: number; max?: number }) {
  const pct = (value / max) * 100;
  // If it's glow or hydration, high is good. Otherwise, low is good.
  const isHighGood = label === "Overall Score" || label === "Glow Score" || label === "Hydration";

  const color = isHighGood
    ? value >= 7.5 ? "#22c55e" : value >= 5.0 ? "#f59e0b" : "#ef4444"
    : value < 3.5 ? "#22c55e" : value < 6.0 ? "#f59e0b" : "#ef4444";

  return (
    <div className="flex items-center gap-4 py-2 border-b border-gray-100 last:border-0">
      <span className="w-44 text-gray-600 text-sm font-medium">{label}</span>
      <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="w-12 text-right font-bold text-gray-800 text-sm">{value}/10</span>
    </div>
  );
}

export default function SkinReport() {
  const { skinData } = useSkin();
  const result = skinData.result;
  const recs = skinData.recommendations;

  if (!result) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-pink-50 to-rose-100">
        <div className="text-center">
          <p className="text-6xl mb-4">📋</p>
          <h2 className="text-gray-800 text-2xl font-bold mb-3">No Report Available</h2>
          <p className="text-gray-600 mb-6">Run a skin analysis to generate your report</p>
          <Link to="/skin-scan" className="inline-block px-8 py-4 rounded-2xl font-bold text-white bg-pink-600 hover:bg-pink-700">
            ✨ Start Skin Analysis
          </Link>
        </div>
      </div>
    );
  }

  const handleDownload = () => {
    const pdf = new jsPDF();
    const margin = 18;
    let y = 22;

    // Header
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(22);
    pdf.setTextColor(219, 39, 119);
    pdf.text("AI SkinCare Analyzer Report", margin, y);

    y += 8;
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(10);
    pdf.setTextColor(107, 114, 128);
    pdf.text(`Generated: ${new Date(result.timestamp).toLocaleString()}`, margin, y);
    pdf.text(`Skin Type: ${result.skinType}   |   Confidence: ${result.analysisConfidence || 85}%`, margin, y + 5);

    y += 15;
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(14);
    pdf.setTextColor(17, 24, 39);
    pdf.text("Skin Analysis Results", margin, y);

    y += 8;
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(10);

    const metrics = [
      ["Overall Skin Score", `${result.overallScore}/10`],
      ["Skin Type", result.skinType],
      ["Analysis Confidence", `${result.analysisConfidence || 85}%`],
      ["Glow Score", `${result.glowScore}/10`],
      ["Hydration", `${result.hydration}/10`],
      ["Acne Level", `${result.acneLevel}/10`],
      ["Blackheads / Whiteheads", `${result.blackheads}/10`],
      ["Dark Circles", `${result.darkCircles}/10`],
      ["Oiliness", `${result.oiliness}/10`],
      ["Dryness", `${result.dryness}/10`],
      ["Redness", `${result.redness}/10`],
      ["Pore Visibility", `${result.poreVisibility}/10`],
      ["Pigmentation", `${result.pigmentation}/10`],
      ["Melasma", `${result.melasma}/10`],
      ["Sun Damage / Tanning", `${result.tanning}/10`],
      ["Texture (Roughness)", `${result.texture}/10`],
      ["Dullness", `${result.dullness}/10`],
      ["Acne Scars / Marks", `${result.acneScars}/10`],
      ["Ageing / Fine Lines", `${result.aging}/10`],
      ["Under-eye Puffiness", `${result.puffiness}/10`],
      ["Dehydration", `${result.dehydration}/10`],
      ["Milia", `${result.milia}/10`],
      ["Sunburn / Irritation", `${result.sunburn}/10`],
    ];

    metrics.forEach(([label, val]) => {
      if (y > 275) {
        pdf.addPage();
        y = 20;
      }
      pdf.setTextColor(75, 85, 99);
      pdf.text(`${label}:`, margin, y);
      pdf.setTextColor(17, 24, 39);
      pdf.setFont("helvetica", "bold");
      pdf.text(val, margin + 80, y);
      pdf.setFont("helvetica", "normal");
      y += 6;
    });

    if (result.detectedConcerns && result.detectedConcerns.length > 0) {
      y += 5;
      if (y > 260) { pdf.addPage(); y = 20; }
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(12);
      pdf.setTextColor(219, 39, 119);
      pdf.text("Auto-Detected Concerns", margin, y);
      y += 7;
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(10);
      pdf.setTextColor(75, 85, 99);
      pdf.text(result.detectedConcerns.join(", "), margin, y);
      y += 8;
    }

    y += 5;
    if (y > 250) { pdf.addPage(); y = 20; }
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(14);
    pdf.setTextColor(17, 24, 39);
    pdf.text("Morning Routine", margin, y);
    y += 8;
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(10);
    recs?.morningRoutine.forEach((step) => {
      if (y > 265) { pdf.addPage(); y = 20; }
      pdf.setTextColor(75, 85, 99);
      pdf.text(`${step.order}. ${step.step} — ${step.product}`, margin, y);
      y += 5.5;
      const lines = pdf.splitTextToSize(`   ${step.why}`, 170);
      pdf.setTextColor(107, 114, 128);
      pdf.text(lines, margin, y);
      y += lines.length * 5 + 2;
    });

    y += 3;
    if (y > 250) { pdf.addPage(); y = 20; }
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(14);
    pdf.setTextColor(17, 24, 39);
    pdf.text("Night Routine", margin, y);
    y += 8;
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(10);
    recs?.nightRoutine.forEach((step) => {
      if (y > 265) { pdf.addPage(); y = 20; }
      pdf.setTextColor(75, 85, 99);
      pdf.text(`${step.order}. ${step.step} — ${step.product}`, margin, y);
      y += 5.5;
      const lines = pdf.splitTextToSize(`   ${step.why}`, 170);
      pdf.setTextColor(107, 114, 128);
      pdf.text(lines, margin, y);
      y += lines.length * 5 + 2;
    });

    if (recs && recs.issueGuides.length > 0) {
      y += 8;
      if (y > 250) { pdf.addPage(); y = 20; }
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(14);
      pdf.setTextColor(17, 24, 39);
      pdf.text("Skin Issue Cure Guides", margin, y);
      y += 8;
      recs.issueGuides.forEach((guide) => {
        if (y > 240) { pdf.addPage(); y = 20; }
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(11);
        pdf.setTextColor(219, 39, 119);
        pdf.text(`${guide.issue} (${guide.severity})`, margin, y);
        y += 6;
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(9);
        pdf.setTextColor(75, 85, 99);
        pdf.text("How to Fix:", margin + 4, y);
        y += 5;
        guide.howToFix.slice(0, 4).forEach((fix, i) => {
          if (y > 275) { pdf.addPage(); y = 20; }
          const lines = pdf.splitTextToSize(`${i + 1}. ${fix}`, 165);
          pdf.text(lines, margin + 4, y);
          y += lines.length * 5 + 1;
        });
        if (y > 275) { pdf.addPage(); y = 20; }
        pdf.text(`Timeline: ${guide.timeToImprove}`, margin + 4, y);
        y += 8;
      });
    }

    y += 5;
    if (y > 270) { pdf.addPage(); y = 20; }
    pdf.setFontSize(8);
    pdf.setTextColor(156, 163, 175);
    pdf.text("This report provides AI-estimated cosmetic skincare guidance based on visible facial features.", margin, y);
    pdf.text("It does not diagnose skin conditions or replace professional medical advice from a dermatologist.", margin, y + 4);

    const date = new Date().toISOString().slice(0, 10);
    pdf.save(`skincare-report-${date}.pdf`);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-rose-50 via-pink-50 to-purple-50 px-4 py-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="bg-gradient-to-r from-pink-600 to-violet-600 rounded-3xl p-8 text-white mb-6 shadow-2xl">
          <div className="flex flex-col md:flex-row items-center gap-6">
            <div className="flex-1">
              <p className="text-pink-200 text-sm font-semibold uppercase tracking-widest mb-1">AI SkinCare Analyzer</p>
              <h1 className="text-3xl font-extrabold">Your Skin Report</h1>
              <p className="text-pink-200 text-sm mt-2 font-medium">
                {new Date(result.timestamp).toLocaleDateString("en-IN", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
              </p>
              <span className="mt-3 inline-block bg-white/20 border border-white/30 text-white text-xs px-3.5 py-1 rounded-full font-bold">
                🎯 Analysis Confidence: {result.analysisConfidence || 85}%
              </span>
            </div>
            <div className="text-center">
              <div className="relative inline-flex items-center justify-center">
                <svg width="120" height="120" className="-rotate-90">
                  <circle cx="60" cy="60" r="50" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="10" />
                  <circle
                    cx="60" cy="60" r="50" fill="none"
                    stroke="white"
                    strokeWidth="10"
                    strokeDasharray={`${(result.overallScore / 10) * 314} 314`}
                    strokeLinecap="round"
                  />
                </svg>
                <div className="absolute text-center">
                  <p className="text-4xl font-extrabold">{result.overallScore}</p>
                  <p className="text-pink-200 text-xs">/10</p>
                </div>
              </div>
              <p className="text-white font-bold mt-1">{result.skinType} Skin</p>
            </div>
          </div>
        </div>

        {/* Disclaimer */}
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6 text-amber-800 text-sm">
          ⚠️ <strong>Disclaimer:</strong> This report provides AI-estimated cosmetic skincare guidance based on visible facial features. It does not diagnose diseases or replace professional medical advice from a qualified dermatologist.
        </div>

        {/* Auto-detected Concerns */}
        {result.detectedConcerns && result.detectedConcerns.length > 0 && (
          <div className="bg-white rounded-3xl shadow-lg p-6 mb-6">
            <h2 className="text-xl font-bold text-gray-800 mb-3">🔍 Auto-Detected Skin Conditions</h2>
            <div className="flex flex-wrap gap-2">
              {result.detectedConcerns.map((tag) => (
                <span key={tag} className="px-3.5 py-1.5 rounded-full text-xs font-semibold bg-pink-50 border border-pink-100 text-pink-700 shadow-sm">
                  🏷️ {tag}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Skin Metrics Grid */}
        <div className="bg-white rounded-3xl shadow-lg p-6 mb-6">
          <h2 className="text-xl font-bold text-gray-800 mb-4">📊 Skin Analysis Results</h2>
          <div className="grid md:grid-cols-2 gap-x-8 gap-y-2">
            <div>
              <MetricRow label="Overall Score" value={result.overallScore} />
              <MetricRow label="Glow Score" value={result.glowScore} />
              <MetricRow label="Hydration" value={result.hydration} />
              <MetricRow label="Acne Level" value={result.acneLevel} />
              <MetricRow label="Blackheads" value={result.blackheads} />
              <MetricRow label="Dark Circles" value={result.darkCircles} />
              <MetricRow label="Oiliness" value={result.oiliness} />
              <MetricRow label="Dryness" value={result.dryness} />
              <MetricRow label="Redness" value={result.redness} />
              <MetricRow label="Pore Visibility" value={result.poreVisibility} />
            </div>
            <div>
              <MetricRow label="Pigmentation" value={result.pigmentation} />
              <MetricRow label="Melasma" value={result.melasma} />
              <MetricRow label="Sun Damage / Tanning" value={result.tanning} />
              <MetricRow label="Texture" value={result.texture} />
              <MetricRow label="Dullness" value={result.dullness} />
              <MetricRow label="Acne Scars" value={result.acneScars} />
              <MetricRow label="Ageing / Fine Lines" value={result.aging} />
              <MetricRow label="Puffiness" value={result.puffiness} />
              <MetricRow label="Dehydration" value={result.dehydration} />
              <MetricRow label="Milia" value={result.milia} />
              <MetricRow label="Sunburn" value={result.sunburn} />
            </div>
          </div>
        </div>

        {/* Routines */}
        {recs && (
          <div className="grid md:grid-cols-2 gap-6 mb-6">
            <div className="bg-white rounded-3xl shadow-lg p-6">
              <h2 className="text-xl font-bold text-gray-800 mb-4">🌅 Morning Routine</h2>
              <div className="space-y-4">
                {recs.morningRoutine.map((step) => (
                  <div key={step.order} className="flex gap-3">
                    <span className="w-7 h-7 flex-shrink-0 rounded-full bg-amber-100 text-amber-700 text-xs font-bold flex items-center justify-center">{step.order}</span>
                    <div>
                      <p className="font-semibold text-gray-800 text-sm">{step.step}</p>
                      <p className="text-pink-600 text-xs font-semibold">{step.product}</p>
                      <p className="text-gray-500 text-xs mt-0.5 leading-relaxed">{step.why}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-white rounded-3xl shadow-lg p-6">
              <h2 className="text-xl font-bold text-gray-800 mb-4">🌙 Night Routine</h2>
              <div className="space-y-4">
                {recs.nightRoutine.map((step) => (
                  <div key={step.order} className="flex gap-3">
                    <span className="w-7 h-7 flex-shrink-0 rounded-full bg-violet-100 text-violet-700 text-xs font-bold flex items-center justify-center">{step.order}</span>
                    <div>
                      <p className="font-semibold text-gray-800 text-sm">{step.step}</p>
                      <p className="text-violet-600 text-xs font-semibold">{step.product}</p>
                      <p className="text-gray-500 text-xs mt-0.5 leading-relaxed">{step.why}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Ingredient guidance */}
        {recs && recs.products.length > 0 && (
          <div className="bg-white rounded-3xl shadow-lg p-6 mb-6">
            <h2 className="text-xl font-bold text-gray-800 mb-4">🧪 Recommended Ingredients</h2>
            <div className="grid sm:grid-cols-2 gap-3">
              {recs.products.slice(0, 6).map((product) => (
                <div key={product.name} className="border border-gray-100 rounded-xl p-4 hover:border-pink-200 transition">
                  <p className="font-bold text-gray-800 text-sm">{product.name}</p>
                  <p className="text-pink-600 text-xs font-semibold">Ingredient-based suggestion</p>
                  <p className="text-gray-500 text-xs mt-1">{product.benefit}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex flex-wrap justify-center gap-4">
          <button
            onClick={handleDownload}
            className="px-8 py-3.5 rounded-2xl font-bold text-white shadow-lg transition hover:scale-105"
            style={{ background: "linear-gradient(135deg, #ec4899, #8b5cf6)" }}
          >
            📥 Download PDF Report
          </button>
          <Link to="/skin-scan" className="px-8 py-3.5 rounded-2xl font-bold text-gray-700 bg-white border border-gray-200 shadow hover:bg-gray-50 transition">
            🔄 Scan Again
          </Link>
          <Link to="/skin-dashboard" className="px-8 py-3.5 rounded-2xl font-bold text-gray-700 bg-white border border-gray-200 shadow hover:bg-gray-50 transition">
            📊 Full Dashboard
          </Link>
          <Link to="/skin-history" className="px-8 py-3.5 rounded-2xl font-bold text-gray-700 bg-white border border-gray-200 shadow hover:bg-gray-50 transition">
            📈 Scan History
          </Link>
        </div>
      </div>
    </div>
  );
}
