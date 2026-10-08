# Inspire Soccer — deployment instructions

## Current status
This package adds an initial admin-only Weekly Intelligence screen (explainable suggestions and private factual notes) and date-filtered player/team report with CSV export. It does NOT yet implement all requested features: monthly must-win votes, automated weekly snapshots/notifications, Polar/VEO integrations, push birthday notifications, complete external-data ingestion, and full staff voting remain future work. Weekly scores are exploratory, not validated player-performance ratings. No production deployment or end-to-end authentication test has been performed.

## Database migration order (existing database only)
1. Back up Supabase database before changes.
2. Run `supabase/modular_support.sql` if it has not previously been applied. Inspect its view definition for compatibility with your existing schema.
3. Run `supabase/phase2_player_profile.sql` (same content as phase-2 migration).
4. Run `supabase/phase3_session_standouts.sql`.
5. Run `supabase/phase4_private_flags.sql`.
Run each in Supabase SQL Editor and stop if an error occurs. Never reset/drop the existing database to fix an error.

## Users (Supabase, NOT Vercel)
In Supabase Dashboard > Authentication > Users, invite or create three unique accounts using the real email addresses for Susan, Berta and Sergi. Each should set their own strong password via invite/reset email. In Table Editor > `profiles`, ensure each auth user's UUID has a corresponding row with role `admin`, `admin`, `coach` respectively. Inspect the table's actual required columns before inserting rows. Confirm RLS policies for existing tables enforce permissions server-side, not just by hiding buttons. Test each account separately before deleting old users. Avoid putting passwords, service-role keys or user tokens in the frontend or GitHub.

## Login persistence
Supabase Auth is configured to persist and refresh sessions in browser storage. Users should remain signed in on their own device until logout, expiration/revocation or browser storage clearing. Never store plaintext passwords. Shared devices should be logged out.

## Local setup
Copy existing local `.env` (never commit it) to project root. `npm install`, `npm run dev`. Verify Home, sessions, standouts, Weekly flags, Reports, and role-specific access. `npm run build` before deployment.

## Vercel
Keep `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` as environment variables. Redeploy after testing. Never set `DEV_BYPASS_LOGIN=true` in production.
