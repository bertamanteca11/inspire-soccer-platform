# Batch 3B: callup semantics audit and proposal (not implemented)

Read-only code audit. No production connection, schema inspection or data repair
was performed. UI copy/layout changes in this batch do not change callup logic.

## Storage contract established by application code

CallupPage's CallupRow contains id, session_id, player_id, status, evaluable and
optional notes. Upserts target onConflict=session_id,player_id. That assumes a
matching unique constraint, but the repository does not contain the full callups
table/enum/trigger/RLS definition. Actual constraints, defaults and policies need
read-only verification before implementing the proposed rule.

| Persisted state | Current meaning |
| --- | --- |
| called_up / evaluable=true | Called and eligible for sporting evaluation if attendance also permits. |
| trial / evaluable=true | Trial participant, similarly eligible. |
| guest_not_evaluable / evaluable=false | Included guest, not eligible for a numerical evaluation. |
| not_called / evaluable=false | Explicitly not called. |
| No row | No persisted decision; cannot establish sporting eligibility. Not equivalent to either true or false. |

There is no called boolean used by these consumers. evaluable=false is not a
synonym for No convocado: guests demonstrate the difference. Unknown/null or
conflicting values should not be normalized by guessing.

## Confirmed code behavior and cause of inconsistency

- src/pages/CallupPage.tsx defaultChoice: active/injured -> called_up,true;
  trial -> trial,true; guest -> guest_not_evaluable,false. The queried roster is
  current active/injured/trial/guest players, ordered by shared jersey sorting.
- The load effect preserves existing rows. Missing players receive defaults only
  when the session is unconfirmed AND the entire callup result is empty.
  Otherwise their drafts are null and display Sin registro. A single saved
  decision therefore changes how all other missing rows initialize on reload.
- togglePlayer persists immediately. A null draft becomes the player's default
  choice on the first tap, then not_called,false on the next tap. Explicitly
  not_called becomes the default when toggled back. No record is deleted.
- calledCount counts any non-not_called draft, including guests; it is a draft
  roster count, not the number of numerically evaluable participants.
- confirmConvocatoria blocks unresolved drafts, asks the existing confirmation,
  upserts explicit rows for every currently visible player, then updates session
  callup_confirmed/callup_confirmed_at. These are separate requests, not an atomic
  transaction. Attendance, evaluations, notes and disciplinary data are retained.
- reopenConvocatoria is admin-only in the current UI and clears confirmation
  flags only. It preserves rows and does not restore defaults for missing rows
  when existing records remain. Reopening a historical session does not establish
  that today's roster belongs to that historical session.
- src/pages/SessionsPage.tsx saveSession inserts session metadata/rating limits;
  it does not seed callups client-side. Server-side triggers are not established
  by this repository. modular_support.sql supplies default-false session
  confirmation flags, not a complete callup schema.

Do not conceal additional existing limitations: read errors can flow into the
empty-result initialization branch; duplicate player rows become last-row wins
in the map; persistChoice can return success with no returned data; session
confirmation/reopening updates do not verify an affected row. These require a
separately authorized correctness change, not a visual workaround in this batch.

## Downstream effects

- App.tsx Platform.load builds session players from explicit callups whose status
  is not not_called, union stored attendance player IDs. Missing callups alone
  do not populate that session roster.
- AttendancePage loads the current roster separately. Its calledIds contains
  only stored non-not_called rows; everyone else receives the No convocado
  label, including missing rows. This is a confirmed presentation mismatch with
  unknown semantics. It remains unchanged pending approval. Attendance is gated
  by session.callup_confirmed and never infers presence/absence from callups.
- evaluationEligibility.ts eligibilityReason requires exactly one stored
  called_up/trial row with evaluable===true, plus one sporting-attendance row.
  EvaluationPage additionally requires confirmed callups and attendance for input.
  Historical aggregates retain their existing evaluated-row rules; do not invent
  a new session-level confirmation gate during this change.
- loadPerformanceData applies that shared eligibility to Home, Summary, Players,
  Reports and Intelligence. Persisting new historical callups could bring old
  evaluations into averages/rankings even without editing any scores.
- Standouts reads stored non-not_called rows for its subjective staff roster.
  HistoryPage reads original callups/attendance/evaluations; its called count
  counts stored rows, not inferred defaults. Explicit attendance counts remain
  independent of callup status. VEO uses its independent imported observations.

## Safe implementation proposal, requiring approval

1. Confirm rollout scope: new/prospectively authorized unconfirmed operational
   sessions versus historical/reopened ones. Do not use unconfirmed alone as a
   proxy for new. Confirm how injured/trial/guest players and later roster joins
   fit the word eligible. Preserve current guest non-evaluable behavior until
   explicitly decided. Identify a reliable session/roster baseline; don't infer
   historical membership from current player status.
2. Perform read-only verification of callup columns, enum/check values, unique
   constraints, foreign keys, defaults, triggers and staff RLS. Inspect missing,
   duplicate and inconsistent rows by session plus confirmation flags. Production
   access/manual review is separate from this local audit; do not backfill.
3. Add a pure draft resolver distinguishing persisted decision, default draft,
   and unresolved historical record. For approved prospective sessions, missing
   eligible players show Convocado by default even if other rows already exist.
   Existing not_called always wins. Display draft/unconfirmed status distinctly.
   Block initialization/confirmation on denied, incomplete or ambiguous reads.
4. Do not write on render/load or feed display defaults into attendance, reporting
   or numeric eligibility. A coach's explicit toggle writes only the reviewed
   player's choice; refresh reconstructs other prospective defaults consistently.
5. On explicit confirmation, persist the reviewed roster as explicit statuses,
   then verify session identity and confirmation state. Prefer an authorized
   transaction/RPC with role and concurrent-state checks for atomicity. Any
   database/RPC work needs separate review and approval. A frontend-only sequence
   cannot guarantee concurrent staff decisions won't be overwritten; don't claim
   atomic safety from additional reads alone.
6. Keep confirmed/historical missing records unresolved, visible and read-only
   unless a coach/admin explicitly reviews an authorized correction. No automatic
   bulk backfill, roster additions, absence inference or historical score changes.
   Admin reopening preserves existing explicit choices. Make attendance's label
   distinguish unknown from explicit not_called without fabricating records.
7. Preserve all downstream stored-row requirements. Compare operational counts,
   averages, exports and history before/after on representative fixtures. Any
   intentional historical correction must disclose possible metric changes.

## Regression coverage for that future implementation

- New empty AND partially saved prospective sessions retain default drafts after
  reload; loading alone performs no writes.
- Explicit not_called,false survives reload/reopening; called_up,false and guest
  states cannot be mistaken for explicit exclusion or sporting eligibility.
- Trials, injuries, guests, inactive players and late roster joins follow the
  approved inclusion rule; historical missing rows remain unknown.
- Confirmation persists reviewed rows without altering attendance, evaluations,
  notes or cards. Denied, zero-row, duplicate, invalid and stale updates never
  display success; concurrent confirmation is handled at the backend boundary.
- Defaults alone never change attendance, averages, rankings, Reports, History,
  Intelligence, subjective standouts or VEO. No attendance is inferred.

This batch adds read-only browser regressions of the CURRENT behavior: fresh
empty unconfirmed callups show defaults without writes; partially stored callups
retain missing rows as Sin registro. The proposed default-rule change is not made.
