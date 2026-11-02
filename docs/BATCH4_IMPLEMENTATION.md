# Batch 4 local implementation preparation

Status: LOCAL ONLY, NOT RELEASE READY. No Supabase migration has been executed.

## Release blockers: do not guess these definitions

The supplied audit establishes RLS roles, unique pairs, global-only lock triggers
on attendance/evaluations/cards, and an evaluation high-rating trigger. The exact
global lock column/predicate, trigger bodies, rating trigger, disciplinary RPC,
and complete schema are not in this repository. Two reviewed adapters are required
before migration 002 will run:

* `public.batch4_assert_global_access(session uuid, actor uuid) RETURNS void`:
  read the real global lock under the caller's already-acquired session lock;
  reject Coach access when globally locked; preserve the live Admin rule and
  any archived/session-type restrictions. Reject nonexistent sessions and invalid
  actors. Never trust a client-supplied role. Use `auth.uid()` and require actor
  equality. Do not implement using a guessed `locked`/`globally_locked` column.
* `public.batch4_finalize_evaluation(session uuid, actor uuid, reviewed jsonb,
  records_only boolean) RETURNS void`: compare the entire reviewed snapshot to
  stored evaluations after locking; validate unique stored callups and attendance,
  sporting eligibility, activity type, explicit scores/N/A and session rating
  limits. Require each eligible player to have exactly one evaluation. Mark only
  eligible explicit evaluations evaluated, then preserve the existing disciplinary
  behavior. Records-only is Admin-only and rejects existing sporting scores.
  It must not close Callups/Attendance, change eligibility, reset scores or rewrite
  historical records. Existing `enforce_high_rating_limit()` remains installed.

Adapters must be reviewed SECURITY DEFINER functions owned by the migration role,
with a fixed safe search_path and no PUBLIC/anon/authenticated execution grant.
Do not expose arbitrary SQL, table names, roles or session column updates.
Migration 002 refuses installation if either adapter is absent. No placeholder
adapter is shipped for production. Tests supply explicitly synthetic adapters;
the evaluation fixture deliberately refuses finalization. Evaluation confirmation
therefore remains a documented blocked integration, not a claimed finished backend.

Also verify `records_only_confirmed`, profiles/auth role ownership, all FK/types,
card session ownership, existing trigger event coverage and any session UPDATE
trigger that could reject a definer RPC or cascade confirmation flags. Cards now
receive an Evaluation workflow lock matching their editor; suspensions and their
RLS/triggers are unchanged. Review this with the live disciplinary implementation.

## Implemented contract

* Marker is nullable smallint, NULL or 1, without default/backfill. Only the explicit
  operational insert branch of SessionsPage sets 1; it requires planned status.
  Historical creation omits it. Creation origin has no preselected choice.
  Metadata edits/archive/restore/reopen never set or reset the marker. External
  historical importers must omit it. Coaches retain existing session RLS and may
  still be denied creation; no session policy is broadened.
* Saved callup choices win, including explicit not_called and guest/trial flags.
  NULL/unknown versions and confirmed gaps stay unresolved. All toggles are local;
  Admin confirmation sends the reviewed roster to a transaction; Coach is read-only.
* Attendance independently loads authoritative stored attendance (never treats a
  failed parent read as empty). Includes current roster and saved/called inactive
  participants. Missing referenced players and duplicates block editing/saving.
  Version 1 called-up players default present only while callups are confirmed and
  attendance open. No default is shared with eligibility/statistics code.
* Guardar writes every eligible selected player including untouched present drafts.
  Existing non-called records/notes remain in the payload. Blank non-called version
  1 players are optional and never automatically present. Legacy sessions retain
  the all-displayed-player explicit selection requirement, without defaults.
* Confirmation compares current drafts to successfully read stored rows; the RPC
  compares them again under the session lock. It never saves attendance. Draft
  changes are discarded on unmount. Reopening requires Admin and only changes that
  workflow's flags (Evaluation also clears its existing records-only flag).
* UI access fails closed if capabilities cannot be loaded. RLS remains unchanged;
  narrow RPCs allow Coach to confirm only Attendance/Evaluation. Existing global
  triggers stay installed. Record guards cover INSERT/UPDATE/DELETE, forbid moving
  records between sessions and serialize against close/reopen on the parent row.
  Existing prerequisite gates also apply at the backend: Attendance requires
  confirmed Callups; Evaluation (including its card editor) requires confirmed
  Callups and Attendance. These checks never toggle another workflow's flags.

Evaluation score/comment/card saving remains the established explicit edit flow;
this batch does not redesign evaluation drafts. Frontend evaluation finalization
uses the blocked adapter-backed transaction, replacing partial evaluated-row updates.
Existing card/suspension saving remains separate and can precede a failed final
confirmation, as before. Do not claim all disciplinary actions are atomic with it.

## Migration and validation order

1. Review exact live definitions and finish adapters in an isolated schema clone.
2. Capture schema, policies, grants, flags and representative historical baselines.
3. Run migration 001, reviewed adapters, then migration 002 in isolated PostgreSQL.
4. Run tests using real authenticated Admin/Coach/viewer contexts and existing live
   trigger definitions. Include concurrent edit/close, deadlock rollback/retry,
   evaluation limits, disciplinary side effects, and forged snapshot requests.
5. Verify marker nullable/no default and all preexisting sessions NULL. Check RLS
   and table grants are unchanged. No historical UPDATE or automatic seeding exists.
6. Only after separate approval migrate Supabase, then release compatible frontend.
   A missing RPC disables editing; do not deploy frontend alone.
7. Validate save/remount/reopen, no-write navigation, stale sessions, denied reads,
   complete attendance payloads, independent flags and globally locked requests.
   Compare eligibility, Summary, rankings, reports, History and VEO baselines.

Local commands: `npm test`, `npm run test:batch4`, `npm run test:batch4-ui`,
`npm run build:check`. The synthetic database suite verifies the shipped guard/RPC
SQL with fixture RLS, not compatibility with Supabase or the missing adapters.
The existing `npm run test:phase4-ui` fixtures now model the narrow RPC contract;
historical empty callups expect unknown records, and attendance verification tests
click Guardar explicitly instead of relying on the removed implicit save.

Prepared verification: the existing 95 Node tests, Batch 4 isolated SQL/resolver
tests, six new workflow/creation browser tests and 40 existing workflow browser
tests pass locally. TypeScript and the Vite build pass (existing chunk-size and
CJS deprecation warnings). No Supabase connection is used by these fixtures.
Concurrency and the real evaluation/global-lock/disciplinary adapters still need
isolated testing against the verified schema; these results do not certify them.

## Rollback

First stop new marker assignment/default generation in a forward frontend patch;
retain local-only drafts, explicit saving and all security guards. Leave version
values, saved records and the nullable column in place. Never roll back to old
autosave or implicit attendance-save code. No automatic deletion/backfill/flag reset.

If installation fails inside 002, ROLLBACK its transaction; 001 is independently
additive. After successful release, prefer disabling a malfunctioning RPC's execute
grant (temporarily blocking confirmation) over removing closed-workflow protection.
Any later schema removal requires a compatible client release, snapshot of marker
values, separately approved removal of dependent functions/triggers, and a verified
replacement security boundary. Do not use CASCADE or drop existing policies/triggers.
