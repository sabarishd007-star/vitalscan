import { Link } from "react-router-dom";

function Hero() {
  return <section className="relative overflow-hidden">
    <div className="absolute inset-0" style={{ background: "linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #1a1a2e 100%)" }} />
    <div className="relative max-w-7xl mx-auto px-4 py-20 text-center">
      <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-md border border-white/20 rounded-full px-5 py-2 mb-6"><span className="w-2 h-2 rounded-full bg-pink-400 animate-ping" /><span className="text-white/80 text-sm font-medium">AI-Powered Skin Care Platform</span></div>
      <h1 className="text-5xl md:text-7xl font-extrabold text-white leading-tight mb-6">Personal <span className="bg-clip-text text-transparent" style={{ backgroundImage: "linear-gradient(135deg, #ec4899, #8b5cf6, #06b6d4)" }}>SkinCare</span><br />Assistant</h1>
      <p className="text-white/60 text-lg md:text-xl max-w-2xl mx-auto mb-10">Analyse visible skin concerns and get a simple routine built around suitable ingredients, care habits, and sunscreen.</p>
      <Link to="/skin-scan" className="inline-block px-8 py-4 rounded-2xl font-bold text-white text-lg transition-all hover:scale-105" style={{ background: "linear-gradient(135deg, #ec4899, #8b5cf6)", boxShadow: "0 0 30px rgba(236,72,153,0.4)" }}>Start Skin Analysis</Link>
      <div className="mt-14 grid grid-cols-2 md:grid-cols-4 gap-6 max-w-3xl mx-auto">{[{ value: "12", label: "Skin Metrics Analysed" }, { value: "AM + PM", label: "Routine Reminders" }, { value: "60s", label: "Analysis Speed" }, { value: "Free", label: "No Subscription" }].map(({ value, label }) => <div key={label} className="bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl py-4 px-2"><p className="text-3xl font-extrabold text-white">{value}</p><p className="text-white/50 text-xs mt-1">{label}</p></div>)}</div>
    </div>
  </section>;
}
export default Hero;
