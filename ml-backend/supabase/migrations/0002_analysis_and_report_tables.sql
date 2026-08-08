-- VitalScan analysis/report tables
-- Run after 0001_create_profiles_table.sql. The frontend writes the scan
-- results directly to skin_reports with the Supabase anon key, so it needs an
-- RLS policy. The backend (service role) writes report_history, profiles and
-- skin_analyses; service role bypasses RLS, so no policies are required there.

-- Scan history — used by src/services/skinReportService.ts
-- (SkinScan.tsx / SkinHistory.tsx). Written by the browser with the anon key.
create table if not exists public.skin_reports (
  id uuid primary key default gen_random_uuid(),
  skin_type text,
  acne_level numeric,
  dark_circles numeric,
  oiliness numeric,
  dryness numeric,
  redness numeric,
  pore_visibility numeric,
  pigmentation numeric,
  texture numeric,
  glow_score numeric,
  hydration numeric,
  overall_score numeric,
  recommendations jsonb,
  created_at timestamp with time zone default now()
);

-- The anon key cannot bypass RLS, so this demo uses an open policy. It lets any
-- client read/write every row. Tighten before production (e.g. add a user_id
-- column and filter policies by it).
alter table public.skin_reports enable row level security;
create policy "Allow all" on skin_reports for all using (true);

-- Health vitals history — written by the backend POST /api/reports
-- (ml-backend/app/services/report_store.py). camelCase columns are quoted to
-- match the exact JSON keys PostgREST sends.
create table if not exists public.report_history (
  id uuid primary key default gen_random_uuid(),
  "heartRate" numeric,
  "bloodPressure" text,
  "oxygenLevel" numeric,
  "respirationRate" numeric,
  "healthScore" numeric,
  "riskLevel" text,
  "stressLevel" text,
  created_at timestamptz not null default now()
);
alter table public.report_history enable row level security;

-- Full skin-analysis runs — written by the backend /analyze-skin route
-- (ml-backend/main.py) for authenticated users. Non-fatal if it fails.
create table if not exists public.skin_analyses (
  id uuid primary key default gen_random_uuid(),
  user_id text,
  overall_score numeric,
  metrics jsonb,
  created_at timestamptz not null default now()
);
alter table public.skin_analyses enable row level security;
