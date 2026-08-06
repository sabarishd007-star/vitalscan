import { Activity, AlertTriangle, HeartPulse, ShieldCheck } from "lucide-react";
import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import HealthCard from "../components/HealthCard";
import HealthChart from "../components/HealthChart";
import { useHealth } from "../context/HealthContext";
import { getReports } from "../services/reportService";

interface Report {
  id: number | string;
  heart_rate?: number; heartRate?: number; blood_pressure?: string; bloodPressure?: string;
  oxygen_level?: number; oxygenLevel?: number; stress_level?: string; stressLevel?: string;
  health_score?: number; healthScore?: number; risk_level?: string; riskLevel?: string; created_at?: string;
}

const getHR = (report: Report) => report.heart_rate ?? report.heartRate ?? 0;
const getScore = (report: Report) => report.health_score ?? report.healthScore ?? 0;
const getRisk = (report: Report) => report.risk_level ?? report.riskLevel ?? "Low";

export default function Dashboard() {
  const { healthData } = useHealth();
  const [reports, setReports] = useState<Report[]>([]);
  const [isLoadingReports, setIsLoadingReports] = useState(true);

  useEffect(() => {
    getReports()
      .then(({ data, error }) => {
        if (error) console.error("Unable to load health reports:", error);
        else setReports(data ?? []);
      })
      .catch((error) => console.error("Unable to load health reports:", error))
      .finally(() => setIsLoadingReports(false));
  }, []);

  const avgHeartRate = reports.length ? Math.round(reports.reduce((sum, report) => sum + getHR(report), 0) / reports.length) : 0;
  const avgHealthScore = reports.length ? Math.round(reports.reduce((sum, report) => sum + getScore(report), 0) / reports.length) : 0;
  const highRisk = reports.filter((report) => ["High", "Moderate"].includes(getRisk(report))).length;

  const summaryCards = [
    { label: "Total scans", value: reports.length, icon: Activity, color: "bg-blue-600" },
    { label: "Average heart rate", value: `${avgHeartRate} BPM`, icon: HeartPulse, color: "bg-rose-600" },
    { label: "Average health score", value: `${avgHealthScore}%`, icon: ShieldCheck, color: "bg-emerald-600" },
    { label: "Elevated risk cases", value: highRisk, icon: AlertTriangle, color: "bg-amber-500" },
  ];

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 sm:px-6 lg:px-10">
      <div className="mx-auto max-w-7xl">
        <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.16em] text-blue-600">VitalScan</p>
            <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">Health analytics dashboard</h1>
            <p className="mt-2 text-slate-600">A clear view of your latest camera-based wellness checks.</p>
          </div>
          <Link to="/scan" className="inline-flex items-center justify-center rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700">Start a new scan</Link>
        </header>

        <section className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4">
          {summaryCards.map(({ label, value, icon: Icon, color }) => (
            <article key={label} className={`${color} rounded-2xl p-6 text-white shadow-sm`}>
              <Icon className="mb-4 opacity-90" size={24} />
              <p className="text-sm font-medium opacity-90">{label}</p>
              <p className="mt-2 text-3xl font-bold">{isLoadingReports ? "—" : value}</p>
            </article>
          ))}
        </section>

        <section className="mt-10">
          <h2 className="mb-4 text-2xl font-bold text-slate-900">Latest scan metrics</h2>
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
            <HealthCard title="Heart Rate" value={`${healthData.heartRate} BPM`} icon="♥" color="bg-red-100" />
            <HealthCard title="Blood Pressure" value={healthData.bloodPressure} icon="⊞" color="bg-blue-100" />
            <HealthCard title="Oxygen Level" value={`${healthData.oxygen}%`} icon="O₂" color="bg-green-100" />
            <HealthCard title="Stress Level" value={healthData.stress} icon="•" color="bg-yellow-100" />
            <HealthCard title="Health Score" value={`${healthData.healthScore}%`} icon="✓" color="bg-purple-100" />
            <HealthCard title="Risk Level" value={healthData.risk} icon="!" color="bg-orange-100" />
          </div>
        </section>

        <div className="mt-10"><HealthChart reports={reports} isLoading={isLoadingReports} /></div>

        <section className="mt-10 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 p-6"><h2 className="text-2xl font-bold text-slate-900">Recent health reports</h2><p className="mt-1 text-sm text-slate-500">Saved results from your completed scans.</p></div>
          <div className="overflow-x-auto"><table className="w-full min-w-[700px] text-left"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="p-4">ID</th><th className="p-4">Heart rate</th><th className="p-4">Blood pressure</th><th className="p-4">Oxygen</th><th className="p-4">Score</th><th className="p-4">Risk level</th></tr></thead>
            <tbody className="divide-y divide-slate-100">{reports.map((report) => <tr key={report.id} className="text-slate-700 hover:bg-slate-50"><td className="p-4 font-mono text-xs">{report.id}</td><td className="p-4 font-semibold">{getHR(report) || "—"}{getHR(report) ? " BPM" : ""}</td><td className="p-4">{report.blood_pressure ?? report.bloodPressure ?? "—"}</td><td className="p-4">{report.oxygen_level ?? report.oxygenLevel ?? "—"}{(report.oxygen_level ?? report.oxygenLevel) ? "%" : ""}</td><td className="p-4 font-semibold text-blue-600">{getScore(report) || "—"}{getScore(report) ? "%" : ""}</td><td className="p-4"><span className={`rounded-full px-3 py-1 text-xs font-bold ${getRisk(report) === "Low" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>{getRisk(report)}</span></td></tr>)}
            {!isLoadingReports && reports.length === 0 && <tr><td colSpan={6} className="p-10 text-center text-slate-500">No scan reports saved yet. <Link to="/scan" className="font-semibold text-blue-600 underline">Run your first scan</Link> to create your history.</td></tr>}
            {isLoadingReports && <tr><td colSpan={6} className="p-10 text-center text-slate-500">Loading saved scans…</td></tr>}</tbody></table></div>
        </section>
        <div className="mt-8 flex justify-center"><Link to="/history" className="rounded-xl border border-blue-200 bg-white px-6 py-3 font-bold text-blue-700 transition hover:bg-blue-50">View full report history</Link></div>
      </div>
    </main>
  );
}
