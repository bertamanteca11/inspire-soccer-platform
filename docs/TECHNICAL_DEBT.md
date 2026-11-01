# Deferred technical debt (not authorized in Phase 1)

No item below authorizes implementation or database changes.

- Evaluation eligibility currently follows attendance and does not fully enforce
  callup/evaluable flags. Preserve until business approval.
- Training displays four differently named qualities while existing confirmation
  and averaging use five stored fields. Do not change categories, meanings,
  defaults, weighting or historical scores without a staff decision.
- Full base schema, RLS, functions, triggers and migration history are missing
  from the repository. Verify the production configuration before proposing SQL.
- Viewer write controls and coach/admin behavior require a separate permissions
  review; do not change them during Phase 1.
- Transactional confirmation, standout replacement and card/suspension saves
  need separate design and database approval.
- Coach standout editing differs between frontend and supplied SQL policies.
- Card accumulation, double-yellow reporting, suspension lifecycle and the
  home-page suspension RPC require a separate disciplinary-rules review.
- Injury workflow and legacy injury semantics require business verification.
- Records Only entry conditions need a separate review. Preserve existing logic.
- Missing logo, PWA assets/offline support and password recovery are deferred.
- Navigation architecture, broad typing/refactoring, CSS consolidation, CI and
  broader tests are deferred. Phase 1 tests cover only the authorized scope.
- Team/season separation, integrations (including VEO), automated snapshots,
  notifications and staff voting are future phases, not authorized here.
- `.env` and generated `dist/` are already tracked. Repository cleanup is
  deferred; do not expose credentials or overwrite generated assets in Phase 1.
