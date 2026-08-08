-- VitalScan user profiles
-- Backend: GET /api/profile and PUT /api/profile (ml-backend/main.py)
-- Keyed by the Firebase UID sent in the X-User-Id header.
-- The profile body is a single JSON document so the field set can evolve
-- without schema churn. Run this in the Supabase SQL Editor (or via migration).

create table if not exists public.profiles (
  user_id text primary key,
  profile jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- The backend uses the service role key (bypasses RLS); keeping RLS enabled
-- means anon/authenticated keys cannot read or write profiles directly.
alter table public.profiles enable row level security;
