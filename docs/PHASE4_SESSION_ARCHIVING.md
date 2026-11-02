# Phase 4 batch 2: session archiving

Local implementation only. Batch 1 remains in the working tree. There were no
production requests, migrations, data changes, VEO changes, commits or deployments.

## Workflow and preservation

- Sessions has separate **Activas** and **Archivadas** catalogs, read with stable
  ID pagination. Archived rows have no operational Select/Edit action. Historical
  detail opens the existing Summary session view, preserving Batch 1 scopes.
- New archive/restore controls are admin-only. Existing coach metadata editing
  remains available. Supabase RLS/grants are authoritative; frontend controls do
  not replace database authorization.
- Archive and restore send only `{ status }`, with both session UUID and expected
  previous status in the UPDATE filter. A returned array must contain exactly one
  row with that UUID and requested status before success is displayed. Empty,
  mismatched, stale, denied and invalid-status responses cannot produce success.
- No attendance, evaluation, callup, disciplinary or VEO record is deleted or
  rewritten. General metadata edits no longer reset rating limits either.
- Restore explicitly chooses **planned** or **completed**. There is no reliable
  persisted pre-archive state in the supplied schema, so the app does not guess it
  from the date or confirmation flags. No new column is required by this design.
- Archiving the selected session clears its operational selection and related
  in-memory input data. Automatic next-session selection filters active states
  in every query and has no fallback to an arbitrary archived session.
- Home sporting rankings, player current-performance calculations, Reports,
  weekly session aggregates and Standouts operational choices filter archive
  status. Summary's completed/reviewed operational scope already excludes archive.
  Raw player attendance history is explicitly labeled as complete history.
  Existing disciplinary history/suspension rules and VEO are preserved.
- History and Summary historical views retain archived sessions and original
  records. Archive is a visibility/scope change, not deletion or score correction.

## Database verification and release blocker

The repository does not contain the original production sessions table, its
status-type definition, policies or triggers. Local code cannot certify those
missing deployed definitions without an authorized production read. No such read
or write was performed in this local-only task.

`diagnostics/phase4_session_archiving_read_only.sql` separately prepares the exact
SELECT-only preflight: status enum/checks, grants, RLS policies, triggers, rating
limits and child FKs. It has not been executed. Confirm:

1. Status accepts `planned`, `completed` and `archived`.
2. The real admin can SELECT the target before and after archiving and UPDATE its
   status. SELECT must permit archived rows for returned-row verification and
   historical views. Existing permitted historical readers must retain access.
3. Existing policies enforce the club's intended authorization. A hidden coach
   archive button does not revoke any existing direct UPDATE privilege/policy.
   If the club needs database-enforced admin-only status changes while coaches
   can edit other fields, design a reviewed column/RPC/trigger policy after this
   preflight; a permissive additional RLS policy alone cannot restrict an existing
   broader policy.
4. Profile roles cannot be self-elevated, and sessions UPDATE triggers do not
   change rating limits or delete/rewrite related records on status changes.

No production migration is confirmed necessary from the available evidence. If
preflight fails, prepare a separate migration against the actual definitions:

- Missing enum label: add `archived` to the discovered, schema-qualified enum;
  do not invent a `session_status` type or replace existing values.
- Text/check status: preserve existing accepted values and extend only the exact
  identified check constraint. Do not drop unknown constraints blindly.
- Missing privileges or policies: narrowly grant the intended role/status action
  and archived-row reads after reviewing all existing permissive policies.
- Trigger side effects: review and amend the specific trigger separately.

Generating executable DDL before these definitions are known could weaken live
authorization or damage unrelated constraints. Consequently this batch includes
the separate preflight and migration specification, not speculative executable DDL.

## Tests

`npm.cmd test`: all 81 tests passed, including archive helpers and actual isolated PGlite SQL with enum,
RLS, nonstandard rating limits, stale status checks and related records.
`npm.cmd run test:phase4-ui`: all 14 tests passed, covering Batch 1 plus archive/restore, explicit restore
state, denied/zero-row/invalid updates, catalog visibility, historical access,
metadata edits preserving limits, and coach control restrictions. Browser traffic
is intercepted; simulated archive writes never reach production.
`npm.cmd run test:veo-ui`: all 8 unchanged VEO regression tests passed.
`npm.cmd run build:check`: TypeScript and the production build passed to ignored output.
Existing Vite CJS deprecation and large-chunk warnings remain.
