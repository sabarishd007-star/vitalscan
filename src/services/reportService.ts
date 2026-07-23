import { supabase } from "../supabase";

export type HealthReportInput = {
  heart_rate: number;
  blood_pressure: string;
  oxygen_level: number;
  health_score: number;
  risk_level: string;
};

export async function saveReport(report: HealthReportInput) {
  return await supabase
    .from("health_reports")
    .insert([report]);
}

export async function getReports() {
  return await supabase
    .from("health_reports")
    .select("*");
}

export async function deleteReport(id: string | number) {
  return await supabase
    .from("health_reports")
    .delete()
    .eq("id", id);
}
