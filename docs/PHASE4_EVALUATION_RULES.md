# Phase 4 batch 3: rule decisions and ambiguities

Recorded before implementing calculation changes. No production writes or schema
changes are authorized. Batches 1/2 and VEO must be preserved.

- Existing callup choices are called_up/trial with evaluable=true, not_called
  with evaluable=false, and guest_not_evaluable with evaluable=false. Numeric
  evaluation additionally requires present, late or justified_late attendance.
  injured_present means physio presence in existing UI and is not sporting
  participation. Missing/duplicate/unknown callups or attendance cannot establish
  eligibility: exclude from current metrics with a diagnostic, never infer absence.
- Training shows four controls while the established formula, database-facing
  field list and regression use five. The intended four-versus-five methodology
  is not established. Preserve the five-field formula and original stored values;
  expose coachability as the fifth control. Do not silently switch historical
  averages to four fields. Owner confirmation remains required for a formula change.
- Default 3 currently represents a displayed fallback, not explicit scoring.
  Stop adding it during confirmation. New draft scores start excluded using the
  existing per-quality N/A flags, until a numeric score is explicitly selected.
  Existing stored 3s cannot be distinguished from deliberate ratings: retain them
  and disclose that historical provenance cannot be reconstructed from current rows.
- Current numeric metrics require a completed, known sporting session, not
  archived/planned/explicitly marked test, dated >=2026-10-14 and not Records Only.
  Legitimate tryouts are not automatically test data. Unknown test classification
  cannot be repaired by name guessing. Batch 1's explicit session review remains.
- Preserve the existing aggregate confirmation rule: evaluated=true on the row.
  Do not add a new historical requirement for session.evaluation_confirmed.
  Input still requires confirmed callups and attendance as before.
- Duplicate stored evaluations for one player/session are ambiguous and must not
  gain extra weight or be arbitrarily chosen. Exclude the ambiguous group from
  current metrics and show a warning; preserve all rows in historical detail.
- Standouts are subjective picks, not calculated averages. Weekly Intelligence
  is an explanatory weighted sum, not a player average. Preserve those meanings
  and their existing weights rather than pretending the indicators are identical.
  The code has not established that numeric-evaluation eligibility must also
  govern subjective picks; preserve the existing called-player selection rule
  instead of silently imposing that additional business constraint.

## Exact formulas

`fieldScore`: only finite integer scores 1 through 5 are numeric. Null, empty,
boolean, nonnumeric or out-of-range values are excluded. Whole-player
`not_applicable` and per-field `na_fields[field] = true` exclude those values.
Numeric database strings representing integers are accepted; no clamping occurs.

`evaluationTotal`: arithmetic mean of the available, non-N/A scores across
`tactical_discipline`, `effort_commitment`, `decision_making`, `mentality_attitude`,
and `coachability`, rounded to two decimal places. With no valid scores, the result
is null, never zero. Training keeps this established five-field baseline while
the owner's methodology decision is pending. Its existing differently worded
training labels are preserved; their semantic mapping to match labels needs owner
confirmation before relabeling or changing historical calculations.

Player average: arithmetic mean of the valid per-evaluation totals, with equal
weight per player/session evaluation, not weight by number of available qualities.
Per-quality average: mean only of that quality's available scores. Numeric rankings
sort descending, then Spanish display name, then player UUID. Displayed player
averages use two decimal places. Stored `total_score` never supplies missing scores.

Duplicates: repeated copies of one database ID collapse. Distinct stored
evaluation IDs for the same player/session exclude that entire ambiguous group
from current metrics. Duplicate callups/attendance make numeric eligibility
unverifiable. All original rows remain accessible. Ambiguous attendance within a
weekly scope leaves the weighted indicator pending rather than inventing which
row or absence penalty is authoritative.

## Page inclusion and meaning

| Page | Session/record scope | Metric |
|---|---|---|
| Summary period | Explicit Batch 1 session IDs and inclusive dates; completed real activity; optional player | Shared eligible player averages and per-quality means; attendance/cards use that same selected session set without the sporting October 14 cutoff |
| Summary history/session | Original attendance/cards remain historical; numeric rankings still use the shared operational source | Separate original-evaluation panel reads raw records, including archived, ineligible, pre-cutoff and duplicate rows, and clearly excludes them from operational rankings |
| Players | All completed real sporting sessions from October 14 with eligible confirmed numeric evaluations | Same player mean, chronological chart, valid per-quality coverage; complete attendance/card history remains separate |
| Home | Same operational source, split training versus match/friendly/scrimmage/tryout | Same equal-per-evaluation means; selected-session scored count uses eligible numeric rows; session confirmation flag retains its workflow meaning |
| Reports | Inclusive selected dates, optional player, completed real activity | Same player means; team mean is over all included evaluation rows, not equally over players; absent numeric data displays N/A; attendance/cards use completed session IDs; injuries retain their independent date-overlap rule |
| Intelligence | Copenhagen Monday inclusive to next Monday exclusive; completed real sessions | Sum of the same rounded evaluation totals, minus 2 per explicit unjustified absence (including injury subtype), minus 1 per unexcused late record, plus 2 per Top pick and minus 1 per Bottom pick; justified absence/late has zero penalty |
| Standouts | Completed real session choices; existing called-player selection and admin editing | Subjective Top/Bottom picks, not a calculated player average; Records Only remains read-only. Weekly/report aggregates additionally apply the official sporting cutoff and reject duplicate player/slot picks |
| History | Original sessions and records, including archive | Raw historical detail remains available; it is not an unfiltered fallback for operational metrics |

All numeric operational evaluation sources require `evaluated=true`, verified
callup/attendance eligibility, valid score(s), session.status=`completed`, a known
sporting type, no explicit `is_test=true`, session date >= October 14, 2026 and no
Records Only flag. Planned sessions can still receive input drafts under the
existing confirmed-callup/attendance workflow, but do not contribute operational
averages until completed. Unmarked disposable tests cannot be identified safely
by name; the owner still needs a durable classification strategy.

Calendar dates are compared as dates, never converted from local midnight to UTC.
The club's current date uses `Europe/Copenhagen`; weekly bounds use calendar
arithmetic and remain Monday-to-Monday through DST and year changes. Default
Intelligence selection remains the previous complete club week. Weekly scores are
not averages or validated objective player ratings.

## Input and preservation

New drafts set existing per-quality N/A flags before any database default score
could be counted. Explicit numeric choices clear only the chosen field's N/A flag;
the N/A button never restores an implicit numeric default. Confirmation re-reads
eligibility and stored evaluations, rejects missing/duplicate/invalid records and
rating-limit violations, and only changes evaluated/confirmation flags. It never
fills missing fields with 3 or overwrites existing numbers. Caps of zero are
respected; null caps use the existing 6-high/3-low defaults. Only eligible rows
with valid, non-N/A fields consume limits (high=4/5; low=1/2).
Confirmation also disables score/comment/card edits and duplicate submissions
while the reviewed data is being validated and saved. This is a client safeguard,
not a substitute for the backend transactionality described below.

Existing disciplinary save/RPC behavior is retained. No real confirmation,
disciplinary RPC, archive/restore, SQL migration or production read/write was
performed by this batch. Browser-test writes are simulated. VEO sources and its
independent metrics remain unchanged.

## Remaining decisions and technical limits

- The owner must confirm four versus five training qualities and the meaning of
  the differently labeled training/match dimensions before any formula migration.
- Old stored 3s have no reliable provenance: a deliberate score cannot be
  distinguished from the former automatic default. They are not deleted or
  rewritten. Historical originals and stored totals are shown for review.
- Missing/conflicting eligibility data must be reviewed; no callup or attendance
  record is fabricated to make an evaluation eligible.
- Supabase must allow authorized staff to read the eligibility sources. If RLS
  denies a required source, current metrics fail closed rather than counting
  unchecked scores. No permission or schema changes are made here.
- Multi-request confirmation remains non-atomic at the backend. Fresh validation
  reduces stale writes, but true transactionality/concurrent rating-limit
  enforcement needs a separately reviewed database RPC/schema change. No new
  historical session-level confirmation requirement is guessed to conceal that.

## Final local validation after resuming

- `npm test`: 95 unit/database tests passed, including Batches 1/2 and VEO.
- `npm run test:phase4-ui`: 24 browser tests passed, including evaluation
  confirmation locking, eligibility, shared averages and historical preservation.
- `npm run test:veo-ui`: 8 browser regressions passed without VEO source changes.
- `npm run build:check`: TypeScript and production build passed; Vite reports
  a bundle-size warning. Output went to ignored `.veo-build-check/`, preserving
  the pre-existing `dist/` changes.
- Production data, schemas and migrations were untouched. Nothing was staged,
  committed, pushed or deployed.
