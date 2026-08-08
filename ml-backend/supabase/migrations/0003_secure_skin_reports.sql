-- VitalScan security hardening for skin_reports
-- Run after 0002_analysis_and_report_tables.sql.
--
-- WHY: The browser used to write skin_reports directly with the Supabase anon
-- key under an open "Allow all" policy. Because app auth is Firebase (not
-- Supabase), RLS auth.uid() can never match the anon key, so per-user rows
-- cannot be protected that way.
--
-- FIX: The frontend now calls POST/GET/DELETE /api/skin-reports with an
-- X-User-Id header; the backend writes through the service role (which bypasses
-- RLS) and filters every query by user_id. The open policy is dropped and no
-- replacement is created, so the anon key can no longer read or write any row.

alter table public.skin_reports add column if not exists user_id text;

drop policy if exists "Allow all" on public.skin_reports;

alter table public.skin_reports enable row level security;

-- Per-user lookups (list + delete) filter by user_id; keep the index small.
create index if not exists skin_reports_user_id_idx on public.skin_reports (user_id);
