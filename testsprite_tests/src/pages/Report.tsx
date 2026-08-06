import { jsPDF } from "jspdf";
import { Link } from "react-router-dom";
import { useHealth } from "../context/HealthContext";

export default function Report() {
  const { healthData } = useHealth();
  const recommendations =
    healthData.risk === "Low"
      ? [
          "Drink at least 2-3 liters of water daily.",
          "Sleep 7-8 hours every night.",
          "Exercise for 30 minutes daily.",
          "Continue your healthy lifestyle.",
          "Eat more fruits and vegetables.",
        ]
      : healthData.risk === "Medium"
        ? [
            "Improve your sleep schedule.",
            "Reduce stress with meditation.",
            "Exercise at least 30 minutes daily.",
            "Reduce junk food intake.",
            "Monitor your health regularly.",
          ]
        : [
            "Consult a doctor for a complete health check.",
            "Reduce stress immediately.",
            "Improve sleep quality.",
            "Maintain a healthy diet.",
            "Schedule regular medical checkups.",
          ];

  const handleDownloadReport = () => {
    const pdf = new jsPDF();
    const margin = 20;
    let y = 24;

    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(22);
    pdf.setTextColor(29, 78, 216);
    pdf.text("VitalScan AI Health Report", margin, y);

    y += 11;
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(10);
    pdf.setTextColor(75, 85, 99);
    pdf.text(`Generated: ${new Date().toLocaleString()}`, margin, y);

    y += 16;
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(15);
    pdf.setTextColor(17, 24, 39);
    pdf.text("Health summary", margin, y);

    y += 10;
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(12);
    const summary = [
      `Health score: ${healthData.healthScore}%`,
      `Risk level: ${healthData.risk}`,
      `Heart rate: ${healthData.heartRate} BPM`,
      `Blood pressure: ${healthData.bloodPressure}`,
      `Oxygen level: ${healthData.oxygen}%`,
      `Stress level: ${healthData.stress}`,
    ];
    summary.forEach((item) => {
      pdf.text(item, margin, y);
      y += 8;
    });

    y += 5;
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(15);
    pdf.text("Recommendations", margin, y);

    y += 9;
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(12);
    recommendations.forEach((recommendation) => {
      const lines = pdf.splitTextToSize(`- ${recommendation}`, 165);
      pdf.text(lines, margin, y);
      y += lines.length * 7 + 2;
    });

    y += 6;
    pdf.setFontSize(9);
    pdf.setTextColor(107, 114, 128);
    pdf.text("This report is informational and is not a medical diagnosis.", margin, y);

    const date = new Date().toISOString().slice(0, 10);
    pdf.save(`vitalscan-health-report-${date}.pdf`);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-cyan-100 p-10">
      <div className="max-w-4xl mx-auto bg-white rounded-3xl shadow-xl p-10">
        <h1 className="text-4xl font-bold text-center text-blue-700 mb-8">AI Health Report</h1>

        <p className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-center text-sm text-amber-900">
          This wellness prototype is not a medical device or diagnosis. Consult a qualified clinician for health concerns.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <MetricCard title="Health Score" value={`${healthData.healthScore}%`} color="bg-green-100" />
          <MetricCard title="Risk Level" value={healthData.risk} color="bg-yellow-100" />
          <MetricCard title="Heart Rate" value={`${healthData.heartRate} BPM`} color="bg-red-100" />
          <MetricCard title="Blood Pressure" value={healthData.bloodPressure} color="bg-blue-100" />
          <MetricCard title="Oxygen Level" value={`${healthData.oxygen}%`} color="bg-green-100" />
          <MetricCard title="Stress Level" value={healthData.stress} color="bg-purple-100" />
        </div>

        <div className="mt-10 bg-gray-100 rounded-2xl p-6">
          <h2 className="text-2xl font-bold mb-4">AI Recommendations</h2>
          <ul className="space-y-3 text-lg">
            {recommendations.map((recommendation) => (
              <li key={recommendation}>- {recommendation}</li>
            ))}
          </ul>
        </div>

        <div className="flex flex-wrap justify-center gap-5 mt-10">
          <button
            type="button"
            onClick={handleDownloadReport}
            className="bg-green-600 hover:bg-green-700 text-white px-8 py-3 rounded-xl font-semibold"
          >
            Download Report (PDF)
          </button>

          <Link to="/scan" className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded-xl font-semibold">
            Scan Again
          </Link>
          <Link to="/history" className="bg-purple-600 hover:bg-purple-700 text-white px-8 py-3 rounded-xl font-semibold">
            Report History
          </Link>
        </div>
      </div>
    </div>
  );
}

function MetricCard({ title, value, color }: { title: string; value: string; color: string }) {
  return (
    <div className={`${color} p-6 rounded-2xl`}>
      <h2 className="text-xl font-bold">{title}</h2>
      <p className="text-2xl font-bold mt-3">{value}</p>
    </div>
  );
}
