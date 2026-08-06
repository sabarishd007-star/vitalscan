import { useEffect, useState } from "react";
import { getReports, deleteReport as removeReportFromDb } from "../services/reportService";

interface Report {
  id: number | string;
  heart_rate?: number;
  heartRate?: number;
  blood_pressure?: string;
  bloodPressure?: string;
  oxygen_level?: number;
  oxygenLevel?: number;
  respiration_rate?: number | null;
  respirationRate?: number | null;
  stress_level?: string;
  stressLevel?: string;
  health_score?: number;
  healthScore?: number;
  risk_level?: string;
  riskLevel?: string;
  created_at?: string;
}

export default function ReportHistory() {
  const [reports, setReports] = useState<Report[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);

  const loadReports = async () => {
    setLoading(true);
    try {
      const { data, error } = await getReports();
      if (error) {
        console.error("Error fetching reports from Supabase:", error);
      } else {
        console.log("Reports data:", data);
        setReports(data || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Loading saved reports is the purpose of this mount effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadReports();
  }, []);

  const handleDelete = async (id: number | string) => {
    if (!window.confirm("Delete this report?")) return;

    try {
      const { error } = await removeReportFromDb(id);
      if (error) {
        alert("Failed to delete report: " + error.message);
      } else {
        await loadReports();
      }
    } catch (err: unknown) {
      console.error(err);
      alert("Error deleting report");
    }
  };

  const getFieldValue = (report: Report, keyCamel: keyof Report, keySnake: keyof Report, fallback: string | number = "--"): string | number => {
    const snake = report[keySnake];
    const camel = report[keyCamel];
    if (snake !== undefined && snake !== null) return snake;
    if (camel !== undefined && camel !== null) return camel;
    return fallback;
  };

  const filteredReports = reports.filter((report) => {
    const risk = String(getFieldValue(report, "riskLevel", "risk_level", "")).toLowerCase();
    return risk.includes(search.toLowerCase());
  });

  return (
    <div className="min-h-screen bg-gray-100 p-10">
      <div className="max-w-7xl mx-auto bg-white rounded-2xl shadow-xl p-8">

        <h1 className="text-4xl font-bold text-center text-blue-700 mb-8">
          📋 Health Report History
        </h1>

        <div className="flex justify-between items-center mb-6">
          <p className="text-xl font-semibold">
            Total Reports: {filteredReports.length}
          </p>

          <input
            type="text"
            placeholder="Search by Risk Level..."
            className="border rounded-lg px-4 py-2"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <table className="w-full border">
          <thead className="bg-blue-600 text-white">
            <tr>
              <th className="p-3">ID</th>
              <th>Heart Rate</th>
              <th>Respiration</th>
              <th>BP</th>
              <th>Oxygen</th>
              <th>Stress</th>
              <th>Score</th>
              <th>Risk</th>
              <th>Action</th>
            </tr>
          </thead>

          <tbody>
            {filteredReports.map((report) => {
              const hr = getFieldValue(report, "heartRate", "heart_rate");
              const respiration = getFieldValue(report, "respirationRate", "respiration_rate", "—");
              const bp = getFieldValue(report, "bloodPressure", "blood_pressure", "—");
              const oxygen = getFieldValue(report, "oxygenLevel", "oxygen_level", "—");
              const stress = getFieldValue(report, "stressLevel", "stress_level", "Low");
              const score = getFieldValue(report, "healthScore", "health_score");
              const risk = getFieldValue(report, "riskLevel", "risk_level");

              return (
                <tr key={report.id} className="text-center border-b hover:bg-gray-100">
                  <td className="p-3 font-mono text-sm">{report.id}</td>
                  <td>{typeof hr === "number" ? `${hr} BPM` : hr}</td>
                  <td>{typeof respiration === "number" ? `${respiration} bpm` : respiration}</td>
                  <td>{bp}</td>
                  <td>{typeof oxygen === "number" ? `${oxygen}%` : oxygen}</td>
                  <td>{stress}</td>
                  <td>{typeof score === "number" ? `${score}%` : score}</td>
                  <td>{risk}</td>
                  <td>
                    <button
                      onClick={() => handleDelete(report.id)}
                      className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm font-semibold transition"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              );
            })}

            {filteredReports.length === 0 && !loading && (
              <tr>
                <td colSpan={9} className="text-center py-6 text-gray-500">
                  No reports found.
                </td>
              </tr>
            )}

            {loading && (
              <tr>
                <td colSpan={9} className="text-center py-6 text-blue-600 font-medium">
                  Loading reports from Supabase...
                </td>
              </tr>
            )}
          </tbody>
        </table>

      </div>
    </div>
  );
}
