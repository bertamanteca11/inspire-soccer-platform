# VEO migration review — 2026-11-01

Scope: `supabase/veo/001_veo_analytics.sql` and `002_veo_read_model.sql`.
Historical pre-activation review; the owner's subsequent production validation
and current deployment procedure are recorded in `VEO_ACTIVATION_HANDOFF.md`.
No remote database was contacted. No deployment, commit or push was performed.

Changes made:

- Keep unknown clean-sheet eligibility as JSON null, and mark current and later
  financial calculations pending consistently with TypeScript.
- Count factual clean sheets independently of financial calculation availability
  in TypeScript, matching SQL occurrence counters.
- Reject inconsistent source-key mappings within a publication, noncanonical
  player UUIDs, unknown fact/match fields, malformed jerseys, invalid revision
  values, string schema versions, and non-ISO dates.
- Canonicalize content hashing by round and player UUID, excluding local metadata;
  reordered player observations remain no-op imports.
- Lock reviewed sessions during publication to prevent concurrent date/type edits
  between validation and commit. Session uniqueness and foreign keys remain enforced.
- Explicitly put pg_temp last in function search paths and revoke anonymous access
  to role helpers. Publication/withdrawal still check the current database profile.

Validation: `npm.cmd test` passed 61 tests, including 12 database subtests
executing both migrations in isolated PGlite PostgreSQL. Tests cover enum-based
roles/session types, authorization/RLS, malformed payloads, idempotence, stale
revisions, rollback chains, complete rollback after a late constraint failure,
J5 cutoff, late corrections, the eighth occurrence, and SQL/TypeScript parity.
`npm.cmd run build:check` passed TypeScript checking and the production Vite build
into `.veo-build-check`. Vite reported CJS deprecation and chunk-size warnings.

Production prerequisites remain manual:

1. Verify PostgreSQL 15+, `auth.uid()`, `gen_random_uuid()`, UUID primary keys in
   profiles/players/sessions, profiles.role, and sessions.session_date (date)/type.
   The repository does not contain the complete deployed base schema.
2. Audit existing profile permissions, triggers and RPCs: untrusted users must not
   be able to assign themselves admin/coach. VEO trusts that existing authority.
   Review function ownership and existing default privileges in the target project.
3. Confirm reviewed player UUIDs and match sessions, dates, opponents and rounds.
   Import does not create or edit operational players, sessions or attendance.
4. Review/apply 001 then 002 manually, preferably first against an isolated copy
   of the deployed schema. These are initial migrations, not rerunnable upgrades.
   If VEO objects already exist, compare definitions before applying anything.
5. Verify actual admin/coach/viewer/anonymous sessions and PostgREST schema reload
   after activation, using the procedure in `VEO_ANALYTICS.md`.

Publication is atomic per RPC, with per-series/season transaction locks and
optimistic revisions. Rollback preserves monotonically increasing revisions and
requires the batch to own each affected current match. Restoring a prior batch
permits withdrawing that prior batch in turn. Concurrent multi-connection behavior
and the deployed project's grants/RLS cannot be certified by in-memory tests.
