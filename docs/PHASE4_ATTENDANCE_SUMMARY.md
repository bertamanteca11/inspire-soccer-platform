# Phase 4: attendance and Summary correctness, batch 1

Local implementation only. No production data/schema changes, VEO changes,
archive writes, commit, merge, push or deployment are part of this batch.

## Summary scopes

- **Periodo y sesiones** is the default operational scope. Choose inclusive date
  bounds and explicitly select the completed sessions reviewed as real activity.
  No session is automatically selected. Changing dates clears the selection.
- Planned, archived, unknown-status/type and explicitly marked test sessions are
  unavailable in this operational scope. An optional existing `is_test` flag is
  honored when returned by `select('*')`; this code does not create that column.
  Types `test`, `trial` and `demo` are not official activity. A legitimate completed
  `tryout` remains eligible; a session's name is not used as a classification rule.
- No reliable production test-data marker has been established. Unmarked tests
  must remain unselected during explicit session review. These choices are local,
  reset on reload and do not write a classification to Supabase.
- **Historial completo** preserves all accessible stored attendance and cards,
  including planned, archived, test and orphaned-session records. It is labeled
  historical, not the official operational total. Nothing is deleted or rewritten.
- **Por sesión** provides explicitly labeled historical session detail.
- Performance retains the existing official-evaluations source, October 14 cutoff,
  Records Only exclusion and N/A-aware formula in every scope. Complete history
  refers to attendance/cards, not a new source of historical evaluation scores.
- Attendance, performance and cards use the same selected session/player scope.
  The session ledger shows UUIDs, dates, stored statuses, missing records and
  duplicate player/session rows. Missing attendance contributes neither presence
  nor absence. Distinct conflicting stored rows are exposed, not silently merged.
- Reads are paginated by stable IDs and fail closed on a source error. Changing
  scope filters one loaded data set, avoiding late-response/session-label races.

## Verified Marcos fixture

Only tests contain the confirmed production identities. There are no production
UUID exceptions or hardcoded counts in application logic.

| Scope | Stored attendance | Unjustified | Justified | Present | Missing sessions |
|---|---:|---:|---:|---:|---:|
| October 18/21/23 sessions | 2 | 0 | 1 | 1 | 1 |
| Verified complete attendance history | 6 | 4 | 1 | 1 | Not inferred |

October 18 has no attendance row. October 21 is justified, with the Guineueta
transfer note. October 23 is present. The four historical unjustified absences
remain October 4, 7, 11 and 14. Fixture session-completion flags and attendance row
IDs are synthetic; production session status was not verified by this batch.

## Attendance editor

Missing or ambiguous stored attendance starts as **Sin registrar**, not Present.
Writing a note does not select a status. Saving or confirming requires an explicit
status for every visible player. Existing statuses and notes are retained. Stale
rows from another session cannot initialize the current session. Roster/callup
read failures block saving, and an attendance refresh failure blocks confirmation.
The existing explicit save/upsert workflow remains; opening a page writes nothing.

## Verification and remaining work

- `npm.cmd test`: 72 tests passed, including the Phase 4 and existing suites.
- `npm.cmd run test:phase4-ui`: 7 component browser tests passed, with all external requests
  intercepted; attendance writes are simulated, never sent to production.
- `npm.cmd run test:veo-ui`: all 8 unchanged VEO browser tests passed.
- `npm.cmd run build:check`: TypeScript and production build passed to ignored output;
  existing Vite CJS-deprecation and large-chunk warnings remain.

To inspect the three-session example in the updated UI, select Marcos, set dates
October 18 through October 23, and select the exact reviewed match/training UUIDs.
If a verified session is still marked planned, it remains excluded from the
operational scope; inspect it through historical detail. Do not silently infer
completion or rewrite its status to make a total match.

Further batches still need the archive workflow fixes, a durable approved test
classification strategy, evaluation eligibility/methodology review, cross-page
scope alignment outside Summary, and the weekly timezone-boundary fix. The visual
redesign has not begun.
