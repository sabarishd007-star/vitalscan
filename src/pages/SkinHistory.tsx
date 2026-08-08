import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getSkinReports, deleteSkinReport } from "../services/skinReportService";

interface SkinReport {
  id: string | number;
  skin_type?: string;
  acne_level?: number;
  dark_circles?: number;
  oiliness?: number;
  dryness?: number;
  redness?: number;
  pore_visibility?: number;
  pigmentation?: number;
  texture?: number;
  glow_score?: number;
  hydration?: number;
  overall_score?: number;
  created_at?: string;
}

function ScorePill({ value, invertedGood = false }: { value: number; invertedGood?: boolean }) {
  const effective = invertedGood ? value : 10 - value;
  const color =
    effective >= 7.5 ? "bg-emerald-100 text-emerald-700" :
    effective >= 6 ? "bg-lime-100 text-lime-700" :
    effective >= 4 ? "bg-amber-100 text-amber-700" :
    "bg-red-100 text-red-700";
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold ${color}`}>
      {value}
    </span>
  );
}

export default function SkinHistory() {
  const [reports, setReports] = useState<SkinReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const loadReports = async () => {
    setLoading(true);
    setError(null);
    const { data, error: fetchError } = await getSkinReports();
    if (fetchError) {
      setError("Could not load scan history. Please ensure the ML backend is running and the skin_reports table is set up in Supabase (migrations 0002 + 0003).");
    } else {
      setReports((data as SkinReport[]) ?? []);
    }
    setLoading(false);
  };

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadReports(); }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const handleDelete = async (id: string | number) => {
    if (!window.confirm("Delete this skin scan report?")) return;
    const { error: delError } = await deleteSkinReport(id);
    if (delError) {
      alert("Could not delete report.");
    } else {
      await loadReports();
    }
  };

  const filtered = reports.filter((r) =>
    !search || r.skin_type?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div
      className="min-h-screen px-4 py-8"
      style={{ background: "linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%)" }}
    >
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
          <div>
            <p className="text-pink-400 text-sm font-bold uppercase tracking-widest">AI SkinCare Analyzer</p>
            <h1 className="text-3xl font-extrabold text-white mt-1">📈 Skin Scan History</h1>
            <p className="text-white/50 text-sm mt-1">Track your skin health progress over time</p>
          </div>
          <div className="flex gap-3">
            <Link
              to="/skin-scan"
              className="px-5 py-2.5 rounded-xl font-bold text-white text-sm transition"
              style={{ background: "linear-gradient(135deg, #ec4899, #8b5cf6)" }}
            >
              ✨ New Scan
            </Link>
            <Link
              to="/skin-dashboard"
              className="px-5 py-2.5 rounded-xl font-bold text-white text-sm bg-white/10 border border-white/20 hover:bg-white/20 transition"
            >
              📊 Dashboard
            </Link>
          </div>
        </div>

        {/* Supabase setup notice */}
        {error && (
          <div className="bg-amber-900/30 border border-amber-500/40 rounded-2xl p-5 mb-6">
            <p className="text-amber-300 font-bold text-sm mb-2">⚠️ Database Not Configured</p>
            <p className="text-amber-200/70 text-sm">{error}</p>
            <div className="mt-3 bg-black/40 rounded-xl p-4">
              <p className="text-amber-300 text-xs font-mono mb-2">Required migrations (run in your Supabase SQL editor):</p>
              <pre className="text-green-400 text-xs font-mono whitespace-pre-wrap">{`0002_analysis_and_report_tables.sql
0003_secure_skin_reports.sql

alter table public.skin_reports add column if not exists user_id text;
drop policy if exists "Allow all" on public.skin_reports;
alter table public.skin_reports enable row level security;`}</pre>
            </div>
          </div>
        )}

        {/* Stats bar */}
        {!loading && !error && reports.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl p-4 text-center">
              <p className="text-3xl font-extrabold text-white">{reports.length}</p>
              <p className="text-white/50 text-xs mt-1">Total Scans</p>
            </div>
            <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl p-4 text-center">
              <p className="text-3xl font-extrabold text-pink-400">
                {reports.length ? (reports.reduce((s, r) => s + (r.overall_score || 0), 0) / reports.length).toFixed(1) : "--"}
              </p>
              <p className="text-white/50 text-xs mt-1">Avg Score /10</p>
            </div>
            <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl p-4 text-center">
              <p className="text-3xl font-extrabold text-yellow-400">
                {reports.length ? Math.max(...reports.map((r) => r.overall_score || 0)).toFixed(1) : "--"}
              </p>
              <p className="text-white/50 text-xs mt-1">Best Score</p>
            </div>
            <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl p-4 text-center">
              <p className="text-2xl font-extrabold text-cyan-400">
                {reports[0]?.skin_type || "--"}
              </p>
              <p className="text-white/50 text-xs mt-1">Latest Skin Type</p>
            </div>
          </div>
        )}

        {/* Search */}
        <div className="mb-4 flex items-center gap-3">
          <input
            type="text"
            placeholder="Search by skin type..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-white/10 border border-white/20 text-white placeholder-white/30 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-pink-500 transition w-64"
          />
          <span className="text-white/50 text-sm">{filtered.length} record{filtered.length !== 1 ? "s" : ""}</span>
        </div>

        {/* Table */}
        <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-3xl overflow-hidden shadow-2xl">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px]">
              <thead>
                <tr className="border-b border-white/10 bg-white/5">
                  {["Date", "Skin Type", "Score", "Glow", "Hydration", "Acne", "Dark Circles", "Oiliness", "Redness", "Action"].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-bold text-white/50 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr>
                    <td colSpan={10} className="text-center py-12 text-white/40">
                      <span className="inline-block w-5 h-5 border-2 border-pink-500/30 border-t-pink-500 rounded-full animate-spin mr-2" />
                      Loading scan history...
                    </td>
                  </tr>
                )}
                {!loading && filtered.length === 0 && !error && (
                  <tr>
                    <td colSpan={10} className="text-center py-16">
                      <p className="text-5xl mb-3">📭</p>
                      <p className="text-white/60 font-medium">No skin scans saved yet.</p>
                      <Link to="/skin-scan" className="inline-block mt-3 text-pink-400 font-semibold text-sm hover:text-pink-300 transition">
                        Run your first skin analysis →
                      </Link>
                    </td>
                  </tr>
                )}
                {!loading && filtered.map((report) => (
                  <tr key={report.id} className="border-b border-white/5 hover:bg-white/5 transition">
                    <td className="px-4 py-3 text-white/60 text-sm">
                      {report.created_at
                        ? new Date(report.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
                        : "--"}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-block bg-pink-500/20 border border-pink-500/30 text-pink-300 text-xs px-2.5 py-1 rounded-full font-semibold">
                        {report.skin_type || "--"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <ScorePill value={report.overall_score ?? 0} invertedGood />
                    </td>
                    <td className="px-4 py-3">
                      <ScorePill value={report.glow_score ?? 0} invertedGood />
                    </td>
                    <td className="px-4 py-3">
                      <ScorePill value={report.hydration ?? 0} invertedGood />
                    </td>
                    <td className="px-4 py-3">
                      <ScorePill value={report.acne_level ?? 0} />
                    </td>
                    <td className="px-4 py-3">
                      <ScorePill value={report.dark_circles ?? 0} />
                    </td>
                    <td className="px-4 py-3">
                      <ScorePill value={report.oiliness ?? 0} />
                    </td>
                    <td className="px-4 py-3">
                      <ScorePill value={report.redness ?? 0} />
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => handleDelete(report.id)}
                        className="text-xs text-red-400 hover:text-red-300 font-semibold border border-red-500/30 px-3 py-1 rounded-lg hover:bg-red-500/10 transition"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <p className="text-white/20 text-xs text-center mt-6">
          Skin analysis results are AI-estimated cosmetic guidance and do not constitute medical advice.
        </p>
      </div>
    </div>
  );
}
