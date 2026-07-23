import {
  CategoryScale,
  Chart as ChartJS,
  Filler,
  Legend,
  LineElement,
  LinearScale,
  PointElement,
  Title,
  Tooltip,
} from "chart.js";
import { Activity } from "lucide-react";
import { Line } from "react-chartjs-2";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Filler, Title, Tooltip, Legend);

export interface ChartReport {
  id: number | string;
  heart_rate?: number;
  heartRate?: number;
  created_at?: string;
}

type HealthChartProps = { reports: ChartReport[]; isLoading?: boolean };

export default function HealthChart({ reports, isLoading = false }: HealthChartProps) {
  const chartReports = reports
    .map((report, index) => ({
      label: report.created_at
        ? new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(report.created_at))
        : `Scan ${index + 1}`,
      heartRate: report.heart_rate ?? report.heartRate,
    }))
    .filter((report): report is { label: string; heartRate: number } => typeof report.heartRate === "number" && Number.isFinite(report.heartRate))
    .slice(-12);

  const data = {
    labels: chartReports.map((report) => report.label),
    datasets: [{
      label: "Heart rate (BPM)",
      data: chartReports.map((report) => report.heartRate),
      borderColor: "#2563eb",
      backgroundColor: "rgba(37, 99, 235, 0.12)",
      pointBackgroundColor: "#ffffff",
      pointBorderColor: "#2563eb",
      pointBorderWidth: 3,
      pointRadius: 4,
      pointHoverRadius: 6,
      fill: true,
      tension: 0.35,
    }],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { intersect: false, mode: "index" as const },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: "#0f172a", padding: 12, displayColors: false,
        callbacks: { label: (context: { parsed: { y: number | null } }) => `${context.parsed.y ?? "--"} BPM` },
      },
    },
    scales: {
      x: { grid: { display: false }, ticks: { color: "#64748b", maxRotation: 0 } },
      y: { beginAtZero: false, grid: { color: "#e2e8f0" }, ticks: { color: "#64748b", callback: (value: string | number) => `${value} BPM` } },
    },
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wider text-blue-600">Trend analysis</p>
          <h2 className="mt-1 text-xl font-bold text-slate-900">Heart rate history</h2>
          <p className="mt-1 text-sm text-slate-500">Your most recent saved scan results.</p>
        </div>
        <div className="rounded-xl bg-blue-50 p-3 text-blue-600"><Activity size={22} /></div>
      </div>
      {isLoading ? (
        <div className="flex h-72 items-center justify-center text-sm font-medium text-slate-500">Loading scan history…</div>
      ) : chartReports.length === 0 ? (
        <div className="flex h-72 flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 px-6 text-center">
          <Activity className="mb-3 text-slate-400" size={32} />
          <p className="font-semibold text-slate-700">No heart-rate trend yet</p>
          <p className="mt-1 max-w-sm text-sm text-slate-500">Complete and save a scan to start building your personal health history.</p>
        </div>
      ) : <div className="h-72"><Line data={data} options={options} /></div>}
    </section>
  );
}
