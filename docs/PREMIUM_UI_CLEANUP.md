# Batch 3B: mobile UI cleanup

Applied on top of the existing uncommitted Batch 3A work, which is preserved.
No database query, mutation, RLS, session selection or scoring rule is changed.

## Presentation changes

- Global shell header contains only the official crest, current page name,
  role/account and logout. Home's page name is Inicio. Session context and the
  disclosure introduced in 3A are removed from the header by product request.
  Safe areas, focus styles, minimum targets and height-aware navigation remain.
- Home mounts SessionWorkflow exactly once immediately below the next-session
  card. The shell does not mount it on Home; the old bottom Action duplicates
  are removed. No session-name label is placed above the shortcuts. Their role
  visibility and setTab callback preserve existing destinations and the selected
  session, even when it differs from the next session highlighted by the card.
  Original Home actions remain available when no session exists; they do not
  fabricate one. Other operational shell shortcuts retain their existing gating.
- SessionHeading places selected session name/opponent inside Callup, Attendance
  and Evaluation rather than prefixing another copy of the page name. It avoids
  repeating an opponent already present in the name. Dates/rivals and other
  session data are not modified. Important guards, errors, confirmed states,
  missing-record warnings and save behavior are retained.
- Repeated instructions are shortened or placed in a Criterios de evaluación
  disclosure. Existing training qualities, N/A and formulas are unchanged.
- ProgressiveAlerts displays the first two items, then up to five, ten and
  subsequent groups of ten, with collapse back to two. Home preserves suspension
  order first and getCardWarnings order next. The former eight-card display cap
  is removed so later alerts remain reachable. Callup suspensions use the same
  presentation pattern. No sort, severity or suspension calculation changes.
- Ranking retains its original formula, ordering, top-three and match/training
  modes. Its canonical OFFICIAL_PERFORMANCE_LABEL states the existing rule's
  inclusive start, 14/10/2026. Exclusion information is retained on demand;
  actual load failures remain visible alerts.
- Small Home-only CSS reduces hero decoration, wraps long names and keeps the
  existing progress counts in a compact three-column mobile layout. It does not
  alter the counts or generic page styles. No VEO stylesheet is changed.

## Callup audit is separate

See CALLUP_SEMANTICS_AUDIT.md for the current row/default/confirmation behavior,
downstream effects and proposed prospective rollout. The default rule was NOT
implemented. Browser regressions explicitly preserve both current empty-session
defaults and partial/historical missing-row behavior with no writes.

The repository lacks the complete callups DDL/RLS/trigger contract; production
verification and decisions about roster eligibility/historical scope are still
required before that future change. No production inspection was performed.

## Validation approach

Existing unit/database, VEO, design-system and shell suites plus the extended
Phase 4 browser suite are run. New fixtures use synthetic sessions and players,
including a selected session different from the next highlighted session, long
names, all three roles and more than ten alerts. External requests are intercepted
with explicit table/RPC responses; unexpected traffic fails assertions. The
existing Home RPC is simulated, never executed against production.

The Phase 4 harness now imports the actual legacy stylesheet so phone layout and
screenshots reflect production styling. Screenshots stay in ignored test artifact
directories. The reference harness is served through intercepted test HTML and
is not a production route. Do not mount operational pages against production for
visual review.

No dependency installation, staging, commit, merge, push or deployment is made.
Physical iOS/Android keyboard, toolbar and safe-area limitations from 3A remain.

## Final results

- 95 unit/database tests passed.
- 40 Phase 4/UI browser tests passed (24 existing, 16 added).
- 34 shell, 8 VEO and 8 design-system browser tests passed.
- TypeScript and final production build passed; existing Vite CJS/large-chunk
  warnings remain. Build and screenshot artifacts are ignored.
- Mobile screenshot inspected. An initial fixture layout run occurred before
  its legacy stylesheet import was complete; focused Home checks and the full
  final suite passed with the actual styles consistently loaded.
- AST checks confirm unchanged Supabase calls in all touched application pages
  and unchanged callup default/persist/toggle/confirm/reopen functions.
- No VEO, schema, score utility or Summary changes. git diff --check passed.
- Existing Batch 3A changes remain local; nothing is staged or committed.
