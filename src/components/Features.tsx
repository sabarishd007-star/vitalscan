import { Link } from "react-router-dom";
const FEATURES = [
  { icon: "✨", title: "Skin Type Detection", desc: "Identifies oily, dry, combination, normal, or sensitive skin." },
  { icon: "🔴", title: "Acne Visibility Analysis", desc: "Highlights visible breakout patterns and care priorities." },
  { icon: "💧", title: "Hydration Estimate", desc: "Uses skin appearance to gauge moisture-related concerns." },
  { icon: "🔬", title: "Pore & Texture Review", desc: "Assesses visible texture and pore concerns." },
  { icon: "🎨", title: "Pigmentation Guidance", desc: "Offers ingredient-led advice for uneven tone." },
  { icon: "🧪", title: "Ingredient Guidance", desc: "Suggests suitable active ingredients and formulations, not brands." },
  { icon: "📋", title: "Personal Routine", desc: "Builds morning and evening care steps for your skin." },
  { icon: "🌿", title: "Skin-Care Reminders", desc: "Keeps daily care habits and sunscreen top of mind." },
];
function Features() { return <section className="py-20 bg-gray-50"><div className="max-w-7xl mx-auto px-4"><div className="text-center mb-14"><p className="text-pink-600 text-sm font-bold uppercase tracking-widest mb-2">Skin Care, Focused</p><h2 className="text-4xl md:text-5xl font-extrabold text-gray-900">Everything You Need for <span className="bg-clip-text text-transparent" style={{ backgroundImage: "linear-gradient(135deg, #ec4899, #8b5cf6)" }}>SkinCare</span></h2><p className="mt-4 text-gray-600 text-lg max-w-xl mx-auto">Analyse your skin, follow ingredient-based guidance, and track changes over time.</p></div><div className="grid md:grid-cols-2 lg:grid-cols-4 gap-5">{FEATURES.map(({ icon, title, desc }) => <div key={title} className="bg-white rounded-2xl shadow-sm border border-pink-50 p-6 hover:shadow-md hover:border-pink-100 transition"><p className="text-3xl mb-3">{icon}</p><h3 className="font-bold text-gray-800 text-base mb-2">{title}</h3><p className="text-gray-500 text-sm">{desc}</p></div>)}</div><div className="text-center mt-8"><Link to="/skin-scan" className="inline-block px-6 py-2.5 rounded-xl font-bold text-white text-sm" style={{ background: "linear-gradient(135deg, #ec4899, #8b5cf6)" }}>Start Skin Analysis →</Link></div></div></section>; }
export default Features;
