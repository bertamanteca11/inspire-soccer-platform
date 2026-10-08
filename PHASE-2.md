# Phase 2 — Player Profile 2.0

## Before opening this version
Run `supabase/phase2_player_profile.sql` once in Supabase → SQL Editor.
It only adds `birth_date`, `career_notes`, and `photo_url` to `players`, plus a public `player-photos` bucket. It does not delete existing player data.

Then keep your existing `.env`, run `npm install` and `npm run dev`.

## Included
- Redesigned mobile player profile
- Birth date + age + upcoming birthday card
- Career / trajectory notes
- Player photo URL support + prepared Supabase Storage bucket
- Injury summary and active-injury alert
- Cards summary
- Attendance/performance summary and evolution
- Phase 1 changes retained

## Photo workflow for now
Upload a photo to Supabase Storage → `player-photos`, copy its public URL, and paste that URL into the player's `URL foto` field. A direct upload UI can be added later without changing the database again.
