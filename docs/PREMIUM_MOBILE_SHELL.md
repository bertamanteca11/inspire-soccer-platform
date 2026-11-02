# Phase 4B Batch 3A: mobile-first shell hardening

## Changes and boundaries

Only shell presentation and its synthetic tests change. App passes the existing
selected session name to the shell on Home, Sessions, Callup, Attendance and
Evaluation. Its state, route guards and Supabase expressions remain unchanged.
No new route, global bottom destination, query, mutation, role rule, confirmation
handler or dependency is introduced. Workflow shortcuts invoke the same setTab
callback and use visibility from the existing navigation catalog. They disappear
when no selected session is supplied. No session is selected automatically.

More uses compact rows (48px minimum, growing for long labels), a non-scrolling
heading/44px close control and an independently scrolling list. Native dialog
top-layer stacking, background scroll lock, both Tab directions, Escape,
backdrop dismissal and return focus are preserved.

The compact header removes the extra brand eyebrow, adds top/side safe-area
padding and bounds the context preview to two lines. A 44px native disclosure
reveals the full context and selected session name in a scrollable panel outside
header flow. Escape closes that disclosure; changing tabs resets it. The crest
is neither transformed nor cropped. Logout now has a 44px minimum width as well
as height. On short viewports the header scrolls with content.

Sidebar navigation requires both width >=768px and height >=500px; full labels
still require width >=1100px. Other layouts use the existing mobile destinations.
CSS and matchMedia share those bounds. Moving between them restores visible
navigation focus, without taking focus from an editable field.

## Keyboard strategy

Use CSS :has/:focus-within to hide only mobile bottom navigation while a writable
main-content input/textarea/contenteditable, or a form, retains focus. Keeping it
hidden through form-button focus prevents it appearing between pointer-down and
pointer-up and intercepting Save. Leaving the field/form restores navigation.
The content's bottom reserve remains, preventing layout jumps. Input scroll
margins, native focus/scroll behavior, dvh and safe-area padding do the rest.

There are no visualViewport listeners, keyboard-size guesses, forced scrolling,
focus changes during editing, value changes or automatic form submissions.
This is conservative editing protection, not actual keyboard detection: navigation
can remain hidden after keyboard dismissal until focus leaves the field/form,
and hardware-keyboard users get the same policy. Select/checkbox/radio/file and
other non-text controls outside forms do not activate the text-field rule.
Older browsers without :has require separate compatibility verification.

## Local validation

`npm run test:shell-ui` uses the existing synthetic fixture, rejects external
requests and imports of the real Supabase module, and saves ignored screenshots.
Coverage adds 320/360/390px long context/labels, persistent close while scrolling,
44px controls, 812x375 and 844x390 landscape, breakpoint focus restoration,
viewport resizing with focused textareas, unchanged drafts, explicit form saves,
feedback visibility and role-specific session shortcuts/no-session behavior.

The automation resizes the viewport; it does not open a real OS keyboard or
emulate nonzero notch insets. Physical iOS Safari and Android Chrome still need
checks for keyboard dismissal/refocus, browser toolbar movement, safe areas,
orientation changes, form/picker/dialog behavior and scroll locking. No claim of
physical-device verification is made. The supplied AVIF-encoded logo.png remains
unchanged, with the previously documented browser compatibility consideration.

Unit/database, Phase 4, VEO, design-system and shell suites plus TypeScript and
production build are required. No operational pages, metrics, evaluation fields,
Summary defaults, report calculations, private records or VEO behavior are changed.
No production access, migrations, commits, branch changes or deployment are made.

## Final results

- 95 unit/database tests passed.
- 24 Phase 4 browser tests passed. The first run had a missing-element timeout;
  the full suite passed on rerun without editing operational code or its tests.
- 8 VEO and 8 design-system browser tests passed.
- 34 shell browser tests passed, including phone widths and short landscape.
- TypeScript and the final production build passed, with existing Vite CJS and
  large-chunk warnings. Build output stays in ignored .veo-build-check/.
- Mobile screenshots inspected, including wrapped labels and bounded header
  context. The More list uses naturally sized rows so long labels are not clipped.
- AST comparison confirms App Supabase expressions unchanged. Crest hash matches
  Batch 2. No operational pages, VEO files or schema files have changes.
- git diff --check passed; no staged files or commits.
