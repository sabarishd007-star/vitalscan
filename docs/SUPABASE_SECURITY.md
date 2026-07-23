# Supabase security checklist

VitalScan currently uses Firebase Authentication and the Supabase browser client separately. Do **not** leave `health_reports` publicly readable or writable for a public deployment.

## Before demo day

1. In Supabase, enable Row Level Security (RLS) for `health_reports`.
2. Do not create a policy that grants `anon` users unrestricted `select`, `insert`, `update`, or `delete` access.
3. Put database access behind a server-side API (for example, Vercel Functions) that validates Firebase ID tokens, or migrate the app to Supabase Auth and use `auth.uid()` policies.
4. Store any Supabase **service-role key** only in Vercel server-side environment variables. Never use it in this React app.

## Why this matters

The Supabase anon key is designed to be visible in a browser bundle. Its safety depends on RLS policies. Because Firebase identities are not automatically Supabase identities, a policy using `auth.uid()` will not protect Firebase users until you implement token validation or use Supabase Auth.

For this hackathon version, avoid entering real medical information and clearly present the product as a wellness demonstration.
