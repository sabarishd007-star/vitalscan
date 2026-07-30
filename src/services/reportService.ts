const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:8080";

export type HealthReportInput = {
  id?: number | string;
  heart_rate: number;
  blood_pressure: string;
  oxygen_level: number;
  health_score: number;
  risk_level: string;
  stress_level?: string;
  created_at?: string;
};

// Map snake_case frontend to camelCase backend
function toBackendFormat(report: HealthReportInput) {
  return {
    id: report.id,
    heartRate: report.heart_rate,
    bloodPressure: report.blood_pressure,
    oxygenLevel: report.oxygen_level,
    healthScore: report.health_score,
    riskLevel: report.risk_level,
    stressLevel: report.stress_level || "Normal",
  };
}

// Map camelCase backend to snake_case frontend
function toFrontendFormat(report: any): HealthReportInput {
  return {
    id: report.id,
    heart_rate: report.heartRate,
    blood_pressure: report.bloodPressure,
    oxygen_level: report.oxygenLevel,
    health_score: report.healthScore,
    risk_level: report.riskLevel,
    stress_level: report.stressLevel,
    created_at: report.createdAt || new Date().toISOString(),
  };
}

export async function saveReport(report: HealthReportInput) {
  try {
    const res = await fetch(`${BACKEND_URL}/api/reports`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(toBackendFormat(report)),
    });
    if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
    const data = await res.json();
    return { data: [toFrontendFormat(data)], error: null };
  } catch (err) {
    console.error("Could not save report to backend:", err);
    return { data: null, error: err as Error };
  }
}

export async function getReports() {
  try {
    const res = await fetch(`${BACKEND_URL}/api/reports`);
    if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
    const list = await res.json();
    return { data: list.map(toFrontendFormat), error: null };
  } catch (err) {
    console.error("Could not fetch reports from backend:", err);
    return { data: [], error: err as Error };
  }
}

export async function deleteReport(id: string | number) {
  try {
    const res = await fetch(`${BACKEND_URL}/api/reports/${id}`, {
      method: "DELETE",
    });
    if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
    return { data: true, error: null };
  } catch (err) {
    console.error("Could not delete report from backend:", err);
    return { data: null, error: err as Error };
  }
}
