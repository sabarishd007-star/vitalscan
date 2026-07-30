import { useState } from "react";
import { Link } from "react-router-dom";
import { useSkin } from "../context/SkinContext";

const METRIC_CONFIG = [
  { key: "overallScore", label: "Overall Score", icon: "⭐", invertedGood: true },
  { key: "glowScore", label: "Glow Score", icon: "✨", invertedGood: true },
  { key: "hydration", label: "Hydration", icon: "💧", invertedGood: true },
  { key: "oiliness", label: "Oiliness", icon: "🫧", invertedGood: false },
  { key: "dryness", label: "Dryness", icon: "🏜️", invertedGood: false },
  { key: "acneLevel", label: "Acne Level", icon: "🔴", invertedGood: false },
  { key: "darkCircles", label: "Dark Circles", icon: "🌑", invertedGood: false },
  { key: "redness", label: "Redness", icon: "🌹", invertedGood: false },
  { key: "poreVisibility", label: "Pore Visibility", icon: "🔬", invertedGood: false },
  { key: "pigmentation", label: "Pigmentation", icon: "🎨", invertedGood: false },
  { key: "texture", label: "Texture", icon: "🪨", invertedGood: false },
];

function getStatusBadge(value: number, invertedGood: boolean) {
  const score = invertedGood ? value : 10 - value;
  if (score >= 7.5) return { label: "Excellent", color: "bg-emerald-100 text-emerald-700 border-emerald-200" };
  if (score >= 6) return { label: "Good", color: "bg-lime-100 text-lime-700 border-lime-200" };
  if (score >= 4) return { label: "Fair", color: "bg-amber-100 text-amber-700 border-amber-200" };
  return { label: "Needs Care", color: "bg-red-100 text-red-700 border-red-200" };
}

function getBarGradient(value: number, invertedGood: boolean) {
  const score = invertedGood ? value : 10 - value;
  if (score >= 7.5) return "from-emerald-400 to-teal-500";
  if (score >= 6) return "from-lime-400 to-green-500";
  if (score >= 4) return "from-amber-400 to-orange-500";
  return "from-red-500 to-rose-600";
}


export default function SkinDashboard() {
  const { skinData } = useSkin();
  const result = skinData.result;
  const recs = skinData.recommendations;
  const [activeTab, setActiveTab] = useState<"overview" | "routine" | "products" | "guides" | "lifestyle">("overview");
  const [expandedGuide, setExpandedGuide] = useState<string | null>(null);

  if (!result) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ background: "linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%)" }}
      >
        <div className="text-center">
          <p className="text-6xl mb-4">🪞</p>
          <h2 className="text-white text-2xl font-bold mb-3">No Scan Data Yet</h2>
          <p className="text-white/60 mb-6">Run a skin analysis first to see your dashboard</p>
          <Link
            to="/skin-scan"
            className="inline-block px-8 py-4 rounded-2xl font-bold text-white"
            style={{ background: "linear-gradient(135deg, #ec4899, #8b5cf6)" }}
          >
            ✨ Start Skin Analysis
          </Link>
        </div>
      </div>
    );
  }

  const overallColor =
    result.overallScore >= 7.5 ? "#22c55e" : result.overallScore >= 5 ? "#f59e0b" : "#ef4444";

  const TABS = [
    { id: "overview", label: "📊 Overview" },
    { id: "routine", label: "🌅 Routine" },
    { id: "products", label: "Ingredients" },
    { id: "guides", label: "💊 Cure Guides" },
    { id: "lifestyle", label: "🌿 Lifestyle" },
  ] as const;

  return (
    <div className="min-h-screen" style={{ background: "linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%)" }}>
      {/* Header */}
      <div className="max-w-7xl mx-auto px-4 pt-8 pb-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
          <div>
            <p className="text-pink-400 text-sm font-bold uppercase tracking-widest">AI SkinCare Analyzer</p>
            <h1 className="text-3xl md:text-4xl font-extrabold text-white mt-1">Skin Analytics Dashboard</h1>
            <p className="text-white/50 text-sm mt-1">
              Scanned on {new Date(result.timestamp).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })}
            </p>
          </div>
          <div className="flex gap-3">
            <Link
              to="/skin-scan"
              className="px-5 py-2.5 rounded-xl font-bold text-white text-sm transition"
              style={{ background: "linear-gradient(135deg, #ec4899, #8b5cf6)" }}
            >
              🔄 New Scan
            </Link>
            <Link
              to="/skin-report"
              className="px-5 py-2.5 rounded-xl font-bold text-white text-sm bg-white/10 border border-white/20 hover:bg-white/20 transition"
            >
              📋 Report
            </Link>
          </div>
        </div>

        {/* Top KPI row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl p-5 flex flex-col items-center">
            <svg width="80" height="80" className="-rotate-90 mb-1">
              <circle cx="40" cy="40" r="32" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="7" />
              <circle
                cx="40" cy="40" r="32" fill="none"
                stroke={overallColor}
                strokeWidth="7"
                strokeDasharray={`${(result.overallScore / 10) * 201} 201`}
                strokeLinecap="round"
              />
            </svg>
            <p className="text-white font-extrabold text-2xl -mt-10">{result.overallScore}</p>
            <p className="text-white/50 text-xs mt-7">Overall /10</p>
          </div>
          <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl p-5 text-center">
            <p className="text-4xl font-extrabold text-pink-400">{result.skinType}</p>
            <p className="text-white/50 text-xs mt-2">Skin Type</p>
          </div>
          <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl p-5 text-center">
            <p className="text-4xl font-extrabold text-cyan-400">{result.hydration}</p>
            <p className="text-white/50 text-xs mt-2">Hydration /10</p>
          </div>
          <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl p-5 text-center">
            <p className="text-4xl font-extrabold text-yellow-400">{result.glowScore}</p>
            <p className="text-white/50 text-xs mt-2">Glow Score /10</p>
          </div>
        </div>

        <section className="mb-6 rounded-2xl border border-pink-400/30 bg-pink-500/10 p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-pink-300 text-sm font-bold uppercase tracking-wider">Today’s skin-care reminders</p>
              <p className="text-white/60 text-sm mt-1">Keep the routine simple and consistent for the best chance of seeing gradual change.</p>
            </div>
            <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white">AM + PM</span>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-3 text-sm">
            <div className="rounded-xl bg-white/5 p-3 text-white/80"><strong className="text-white">Morning:</strong> cleanse gently, moisturize, then apply broad-spectrum SPF 50+.</div>
            <div className="rounded-xl bg-white/5 p-3 text-white/80"><strong className="text-white">Daytime:</strong> reapply sunscreen when exposed to daylight and avoid picking blemishes.</div>
            <div className="rounded-xl bg-white/5 p-3 text-white/80"><strong className="text-white">Evening:</strong> cleanse, use one targeted ingredient, and finish with moisturizer.</div>
          </div>
        </section>

        {/* Tabs */}
        <div className="flex gap-2 overflow-x-auto pb-2 mb-6">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-5 py-2.5 rounded-xl text-sm font-bold whitespace-nowrap transition-all ${
                activeTab === tab.id
                  ? "text-white shadow-lg"
                  : "text-white/50 bg-white/5 border border-white/10 hover:bg-white/10"
              }`}
              style={activeTab === tab.id ? { background: "linear-gradient(135deg, #ec4899, #8b5cf6)" } : {}}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* ── TAB: OVERVIEW ─────────────────────────────── */}
        {activeTab === "overview" && (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {METRIC_CONFIG.filter((m) => m.key !== "overallScore").map(({ key, label, icon, invertedGood }) => {
              const value = result[key as keyof typeof result] as number;
              const badge = getStatusBadge(value, invertedGood);
              const bar = getBarGradient(value, invertedGood);
              return (
                <div key={key} className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl p-5">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xl">{icon}</span>
                      <span className="text-white/80 font-semibold text-sm">{label}</span>
                    </div>
                    <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${badge.color}`}>{badge.label}</span>
                  </div>
                  <p className="text-4xl font-extrabold text-white mb-2">{value}<span className="text-white/40 text-base">/10</span></p>
                  <div className="w-full bg-white/10 rounded-full h-2.5 overflow-hidden">
                    <div className={`h-full bg-gradient-to-r ${bar} rounded-full transition-all duration-1000`} style={{ width: `${value * 10}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── TAB: ROUTINE ─────────────────────────────── */}
        {activeTab === "routine" && recs && (
          <div className="grid md:grid-cols-2 gap-6">
            {/* Morning */}
            <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-3xl p-6">
              <div className="flex items-center gap-3 mb-5">
                <span className="text-3xl">🌅</span>
                <div>
                  <h3 className="text-white font-bold text-xl">Morning Routine</h3>
                  <p className="text-white/50 text-sm">Start your day right</p>
                </div>
              </div>
              <div className="space-y-4">
                {recs.morningRoutine.map((step) => (
                  <div key={step.order} className="flex gap-4">
                    <div className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm text-white" style={{ background: "linear-gradient(135deg, #f59e0b, #f97316)" }}>
                      {step.order}
                    </div>
                    <div className="flex-1">
                      <p className="text-white font-semibold text-sm">{step.step}</p>
                      <p className="text-pink-300 text-xs font-medium mt-0.5">→ {step.product}</p>
                      <p className="text-white/50 text-xs mt-1">{step.why}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Night */}
            <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-3xl p-6">
              <div className="flex items-center gap-3 mb-5">
                <span className="text-3xl">🌙</span>
                <div>
                  <h3 className="text-white font-bold text-xl">Night Routine</h3>
                  <p className="text-white/50 text-sm">Repair while you sleep</p>
                </div>
              </div>
              <div className="space-y-4">
                {recs.nightRoutine.map((step) => (
                  <div key={step.order} className="flex gap-4">
                    <div className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm text-white" style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6)" }}>
                      {step.order}
                    </div>
                    <div className="flex-1">
                      <p className="text-white font-semibold text-sm">{step.step}</p>
                      <p className="text-violet-300 text-xs font-medium mt-0.5">→ {step.product}</p>
                      <p className="text-white/50 text-xs mt-1">{step.why}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Key Ingredients */}
            <div className="md:col-span-2 bg-white/10 backdrop-blur-xl border border-white/20 rounded-3xl p-6">
              <h3 className="text-white font-bold text-xl mb-5">🔬 Key Ingredients for Your Skin</h3>
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {recs.keyIngredients.slice(0, 8).map((item) => (
                  <div key={item.ingredient} className="bg-white/5 border border-white/10 rounded-xl p-4">
                    <p className="text-pink-300 font-bold text-sm">{item.ingredient}</p>
                    <p className="text-white/70 text-xs mt-1">{item.benefit}</p>
                    <p className="text-white/40 text-xs mt-2 italic">Best for: {item.for}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── TAB: PRODUCTS ─────────────────────────────── */}
        {activeTab === "products" && recs && (
          <div>
            <div className="mb-4 bg-blue-500/10 border border-blue-500/30 rounded-xl p-4 text-blue-300 text-sm">
              Ingredient and formulation guidance tailored to your skin analysis. Choose fragrance-free products that contain these ingredients, patch test first, and consult a dermatologist for severe concerns.
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {recs.products.map((product) => (
                <div key={product.name} className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl p-5 hover:bg-white/15 transition">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <p className="text-white font-bold text-sm leading-tight">{product.name}</p>
                      <p className="text-pink-400 text-xs font-semibold mt-0.5">Ingredient-based suggestion</p>
                    </div>
                  </div>
                  <p className="text-white/60 text-xs mb-3">{product.benefit}</p>
                  <span className="inline-block bg-violet-500/20 border border-violet-500/30 text-violet-300 text-xs px-2.5 py-1 rounded-full">
                    🎯 {product.targetIssue}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── TAB: CURE GUIDES ─────────────────────────────── */}
        {activeTab === "guides" && recs && (
          <div className="space-y-4">
            {recs.issueGuides.length === 0 ? (
              <div className="text-center py-16">
                <p className="text-5xl mb-3">🎉</p>
                <p className="text-white text-xl font-bold">Your Skin Looks Healthy!</p>
                <p className="text-white/50 mt-2">No significant concerns detected. Focus on maintenance and SPF.</p>
              </div>
            ) : (
              recs.issueGuides.map((guide) => {
                const isOpen = expandedGuide === guide.issue;
                const sevColor = guide.severity === "Severe" ? "bg-red-500/20 border-red-500/40 text-red-300" : guide.severity === "Moderate" ? "bg-amber-500/20 border-amber-500/40 text-amber-300" : "bg-yellow-500/20 border-yellow-500/40 text-yellow-300";
                return (
                  <div key={guide.issue} className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl overflow-hidden">
                    <button
                      className="w-full flex items-center justify-between p-5 text-left hover:bg-white/5 transition"
                      onClick={() => setExpandedGuide(isOpen ? null : guide.issue)}
                    >
                      <div className="flex items-center gap-3">
                        <div>
                          <p className="text-white font-bold text-lg">{guide.issue}</p>
                          <p className="text-white/50 text-sm mt-0.5">{guide.description.substring(0, 80)}...</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 flex-shrink-0">
                        <span className={`text-xs font-bold px-3 py-1 rounded-full border ${sevColor}`}>{guide.severity}</span>
                        <span className="text-white/50 text-xl">{isOpen ? "▲" : "▼"}</span>
                      </div>
                    </button>

                    {isOpen && (
                      <div className="px-5 pb-6 border-t border-white/10">
                        <p className="text-white/70 text-sm mt-4 leading-relaxed">{guide.description}</p>

                        <div className="grid md:grid-cols-2 gap-4 mt-5">
                          <div>
                            <h4 className="text-white font-bold mb-2 text-sm">⚠️ Common Causes</h4>
                            <ul className="space-y-1">
                              {guide.causes.map((c) => (
                                <li key={c} className="text-white/60 text-xs flex gap-2"><span className="text-pink-400 mt-0.5">•</span>{c}</li>
                              ))}
                            </ul>
                          </div>
                          <div>
                            <h4 className="text-white font-bold mb-2 text-sm">🚫 What to Avoid</h4>
                            <ul className="space-y-1">
                              {guide.avoid.map((a) => (
                                <li key={a} className="text-white/60 text-xs flex gap-2"><span className="text-red-400 mt-0.5">✕</span>{a}</li>
                              ))}
                            </ul>
                          </div>
                        </div>

                        <div className="mt-5">
                          <h4 className="text-white font-bold mb-3 text-sm">✅ How to Fix — Step by Step</h4>
                          <div className="space-y-2">
                            {guide.howToFix.map((fix, i) => (
                              <div key={i} className="flex gap-3 items-start">
                                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 text-xs flex items-center justify-center font-bold">{i + 1}</span>
                                <p className="text-white/70 text-sm">{fix}</p>
                              </div>
                            ))}
                          </div>
                        </div>

                        <div className="mt-5 grid md:grid-cols-2 gap-4">
                          <div>
                            <h4 className="text-white font-bold mb-2 text-sm">🔬 Key Ingredients</h4>
                            <div className="flex flex-wrap gap-2">
                              {guide.ingredients.map((ing) => (
                                <span key={ing} className="text-xs px-2.5 py-1 bg-pink-500/20 border border-pink-500/30 text-pink-300 rounded-full">{ing}</span>
                              ))}
                            </div>
                          </div>
                          <div>
                            <h4 className="text-white font-bold mb-2 text-sm">⏱️ Expected Timeline</h4>
                            <div className="bg-violet-500/20 border border-violet-500/30 rounded-xl p-3">
                              <p className="text-violet-300 text-sm font-medium">{guide.timeToImprove}</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* ── TAB: LIFESTYLE ─────────────────────────────── */}
        {activeTab === "lifestyle" && recs && (
          <div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              {recs.lifestyleTips.map((tip) => (
                <div key={tip.tip} className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl p-5">
                  <p className="text-4xl mb-3">{tip.icon}</p>
                  <p className="text-white font-bold text-sm mb-2">{tip.tip}</p>
                  <p className="text-white/50 text-xs leading-relaxed">{tip.detail}</p>
                </div>
              ))}
            </div>

            <div className="bg-gradient-to-r from-pink-600/20 to-violet-600/20 border border-pink-500/30 rounded-2xl p-6">
              <h3 className="text-white font-bold text-lg mb-3">🌟 Personalized Lifestyle Tips for {result.skinType} Skin</h3>
              <div className="grid md:grid-cols-2 gap-4 text-white/70 text-sm">
                {result.skinType === "Oily" && (
                  <>
                    <p>• Use blotting papers during the day instead of washing your face repeatedly</p>
                    <p>• Reduce high-glycemic foods (sugar, white bread, processed carbs)</p>
                    <p>• Use a clay mask with kaolin or bentonite clay twice a week</p>
                    <p>• Don't skip moisturizer — dehydrated skin produces MORE oil</p>
                  </>
                )}
                {result.skinType === "Dry" && (
                  <>
                    <p>• Apply moisturizer within 3 minutes of washing your face while skin is still damp</p>
                    <p>• Use a humidifier in your bedroom during dry/winter months</p>
                    <p>• Eat healthy fats (avocado, nuts, fish) for skin barrier strength</p>
                    <p>• Drink warm water with lemon in the morning to kickstart hydration</p>
                  </>
                )}
                {result.skinType === "Sensitive" && (
                  <>
                    <p>• Introduce new products one at a time, waiting 1 week between additions</p>
                    <p>• Always patch test on your inner arm before applying to face</p>
                    <p>• Avoid extreme temperature changes (hot showers, cold AC)</p>
                    <p>• Eat anti-inflammatory foods: turmeric, omega-3, leafy greens</p>
                  </>
                )}
                {result.skinType === "Combination" && (
                  <>
                    <p>• Use different products for T-zone and cheeks if needed</p>
                    <p>• Apply lightweight gel moisturizer on oily zones, richer cream on dry areas</p>
                    <p>• Use multi-masking: clay on T-zone, hydrating mask on dry areas</p>
                    <p>• Balance your diet with antioxidant-rich foods to regulate hormones</p>
                  </>
                )}
                {result.skinType === "Normal" && (
                  <>
                    <p>• Maintain your routine consistently — don't over-complicate it</p>
                    <p>• Focus on prevention: SPF daily is your most important product</p>
                    <p>• Add antioxidant serum (vitamin C) for long-term skin health</p>
                    <p>• Continue good sleep, hydration, and balanced diet</p>
                  </>
                )}
              </div>
            </div>

            <div className="mt-6 bg-amber-900/20 border border-amber-500/30 rounded-2xl p-5">
              <div className="flex gap-3 items-start">
                <span className="text-2xl">⚕️</span>
                <div>
                  <p className="text-amber-300 font-bold">When to See a Dermatologist</p>
                  <ul className="text-amber-200/70 text-sm mt-2 space-y-1">
                    <li>• Acne that doesn't improve after 8–12 weeks of consistent skincare</li>
                    <li>• Persistent redness, rashes, or flaking that may indicate eczema or rosacea</li>
                    <li>• Dark spots that worsen despite using SPF and brightening serums</li>
                    <li>• Any new mole, lesion, or skin change that looks unusual</li>
                    <li>• Severe, painful, or cystic acne that needs prescription treatment</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Disclaimer */}
      <div className="max-w-7xl mx-auto px-4 pb-10 mt-6">
        <p className="text-white/30 text-xs text-center">
          This AI analysis is based on visible skin characteristics estimated from webcam imagery. It is for cosmetic guidance only and does not constitute medical advice or diagnosis. Please consult a qualified dermatologist for skin conditions.
        </p>
      </div>
    </div>
  );
}
