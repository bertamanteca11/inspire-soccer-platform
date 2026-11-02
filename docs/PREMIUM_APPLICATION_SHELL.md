# Phase 4B Batch 2: application shell and official crest

## Scope

ApplicationShell owns presentation only. Platform in App.tsx still owns tabs,
the selected/next session, authentication, role guards, loading and data reads.
No Supabase calls, role rules, evaluation/attendance behavior, Summary defaults,
report formulas, player records or VEO publication logic were changed.
Direct authenticated VEO entry retains its existing separate rendering path.

Sidebar and mobile destinations share a typed presentation catalog. Visibility
matches the previous BottomNav for admin, coach and viewer. The existing coach
History menu entry and App redirect remain intentionally unchanged; resolving
that discrepancy needs a separate authorization decision.

## Layout and accessibility

- Below 768px: bottom navigation adapts to the actual visible destinations.
  More opens a native modal dialog in the browser top layer.
- 768–1099px: scrollable navy icon rail, with accessible names and native titles.
- From 1100px: grouped navy sidebar with full labels and readable active states.
- Header: page title, role badge, explicitly named logout and operational context
  only where relevant. Logout calls the same existing signOut operation.
- PageTitle suppresses only an exact repeated visual title inside the shell;
  subtitles and session-specific titles remain. Its heading stays available to
  assistive technology. Outside the shell it renders as before.
- Skip link targets the focusable main landmark. More has a named dialog,
  expanded state, initial close-button focus, forward/reverse Tab wrapping,
  Escape/backdrop closing, scroll containment and focus restoration. Moving to
  tablet/desktop closes it and focuses the active sidebar destination.
- Bottom navigation sits below existing legacy modal backdrops. More uses native
  top-layer stacking rather than competing z-index values.
- Existing smooth navigation scrolling honors reduced-motion preferences.

premium-tokens.css additionally exposes variables on club-shell and club-login.
They do not receive the premium-ui class: legacy page content is not subject to
premium typography/element selectors. Premium scopes are confined to navigation,
the header and More. application-shell.css targets club-prefixed containers,
not global header/card/control/VEO selectors. Legacy page CSS is not deleted.
The content container is responsive, while existing page internals remain intact.
The login change is limited to crest/container presentation; form handlers and
the password/email-link modes remain unchanged.

## Official crest

All shell and login images use /logo.png with object-fit:contain, no clipping,
recoloring, filtering or transformed proportions. The supplied bytes are unchanged.
SHA256: fedde9462d715718a8f31c1a131fab3f58091f3dcc7aa4859a776551d3b7660b.
The supplied file is AVIF encoded despite its .png name. Installed Edge decodes
it correctly in the tests. Older clients lacking AVIF support remain a deployment
compatibility consideration; do not convert or replace the official asset without
approval. No external logo/font service is used.

## Safe local validation

Run `npm run test:shell-ui`. The loopback-only fixture is at
/tests/shell.html on port 4178 during tests. For manual review, use the same path
on the port printed by a local `npm run dev -- --host 127.0.0.1` server.
The shell reference has no App, operational page or real data/provider mounts.
Its selected session, notes and logout callback are synthetic. The login fixture
mounts the pure LoginPanel with a no-op submit callback, never LoginPage or a
Supabase client. Automated tests reject any attempt to import the client module.
All external HTTP requests are blocked and treated as failures in automated tests.
The fixture is not a production entrypoint and is not imported by index.html.

Coverage includes admin/coach/viewer destination matrices at mobile/tablet/desktop,
unchanged synthetic session/draft state, active/expanded semantics, logout callback,
skip link, Escape, both Tab directions, backdrop dismissal, resize handling,
short-screen scrolling, legacy modal stacking, unchanged VEO presentation probes,
image decoding, mobile/desktop screenshots and login authentication-mode controls.
Browser screenshots are ignored under .phase4-test-artifacts/shell/.

No dependency installation, production access, migrations, commits, merges,
pushes or deployments are part of this batch. Existing build-size and Vite CJS
warnings are outside this scope. Further page redesign waits for approval.

## Final validation

- Unit/database suite: 95 passed.
- Phase 4 browser regressions: 24 passed.
- VEO browser regressions: 8 passed, including the final login extraction.
- Batch 1 design-system browser tests: 8 passed.
- Shell browser tests: 18 passed, with external requests blocked and no real
  Supabase module allowed in the fixture.
- TypeScript and final production build: passed. Output remains in ignored
  .veo-build-check; no fixture HTML is included in that production output.
- Mobile, desktop and More-sheet screenshots inspected. Crest hash unchanged.
- AST comparison confirms Supabase expressions in App and LoginPage unchanged.
- git diff --check passed; nothing staged or committed.
