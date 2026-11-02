# Phase 4B Batch 1: premium design foundations

## Scope and local reference

This batch adds opt-in visual primitives only. No existing application page imports
them. There are no auth, Supabase, data, scoring, attendance or VEO dependencies.
The palette is provisional, not a verified official club specification.

Run `npm run dev -- --host 127.0.0.1`, then open
`http://127.0.0.1:5173/tests/design-system.html` (use the port Vite reports).
All values and interactions are synthetic and held only in component state.
The reference imports legacy and VEO CSS for isolation probes, never their pages
or hooks. It does not require credentials. Do not use a production account.

The HTML under tests is a separate Vite development entry. Neither App nor
index.html imports it; the normal production build does not include this page
or its component graph. The dev server should remain bound to loopback. The
reference is not a production route or an authorization mechanism.

## Tokens and style boundaries

`src/styles/premium-tokens.css` defines colors, a system font stack, text sizes,
weights, spacing, corner radii, shadows, focus, target size and motion duration.
Tokens live on `.premium-ui`, not `:root`, and use the `--ds-` prefix. No existing
`--accent`, `.card`, `.primary`, header or VEO selectors are changed.
`premium.css` scopes every component selector beneath `.premium-ui`; animation
names are also prefixed. Do not import premium.css from the application entry as
a way to restyle legacy pages. Import the primitives and wrap an approved
subtree in PremiumScope when its migration is authorized.

- Navy #122C55; primary blue #245BB2; background #F5F7FA; surfaces white.
- Text #17243A; secondary #536176; border #DCE3EC.
- Lime #DFFF45 is a restrained accent with dark text, not a success color.
- Status colors have independent foreground/background pairs. Text labels
  convey meaning alongside color. Selected controls retain a border and
  aria-pressed; confirmed status is not presented as a disabled action.
- Base body size is 1rem, secondary text .875rem, line-height 1.5. Metrics use
  tabular numerals. No external fonts, icons, imagery or dependencies are added.
- Spacing uses a 4px-equivalent scale, with responsive card padding and grids.
  Controls have a 44px minimum height. Keyboard focus has a visible outline.
  Reduced motion removes spinner animation and component transitions.

## Component adoption

Components are exported from `src/components/premium/primitives.tsx`:

| Component | Contract |
| --- | --- |
| PremiumScope | Opt-in wrapper; put it around the smallest approved subtree. |
| PremiumCard | Visual div container; native div attributes/ref-free event props pass through. |
| PremiumButton | Native button props; defaults to type=button to prevent accidental form submissions. Set type=submit deliberately. Loading sets aria-busy and disables interaction, retaining the supplied accessible name. |
| PremiumBadge | Neutral/info/success/warning/danger status label; not an interactive control. |
| PremiumMetric | Displays supplied value/unit/scope, with no formatting, aggregation or inference. Scope text is required. |
| PremiumNotice | Static by default; choose role=status for live feedback or role=alert for urgent failures. |
| PremiumField | Native input props plus associated label, hint and error. Generated IDs connect descriptions. Error sets aria-invalid; required and disabled remain native. |

These are deliberately small foundations, not replacements for all UI patterns.
Selects, textareas, tables, charts, dialogs, navigation and export styling belong
to later approved batches. Do not replace their behavior through these wrappers.

During migration, preserve existing callbacks, values, form submit behavior,
validation, locks, role checks, metric units/precision and scopes. Do not carry
legacy class names such as primary/card/rate into a new component. Keep new
logic out of presentation primitives. Confirm focus and inheritance where a
PremiumScope is embedded into a legacy page. Each production adoption needs
its own browser coverage; the reference is not a substitute for workflow tests.

## Validation

`npm run test:design-ui` uses installed Playwright/Edge on Windows and the existing
VEO_BROWSER_CHANNEL override when needed. Its dev server uses loopback port 4177.
HTTP requests outside that exact local origin are blocked and fail the test.
Browser errors also fail the test. No real data or operational writes are used.
Artifacts go under ignored `.phase4-test-artifacts/design-system/`.

Coverage includes semantic states, accessible labels/descriptions, safe button
defaults, local selection/submission, keyboard focus, reduced motion, 320/390/768/
1440px contained layouts and minimum button targets, token text contrast and
unchanged legacy/VEO probes when premium styles are disabled.
This is focused accessibility coverage, not a complete assistive-technology audit.
Card borders are decorative; inputs use the stronger control-border token to
remain identifiable. Each real workflow still needs focus/contrast review.
Desktop and mobile reference screenshots are saved with the browser artifacts.
No new accessibility dependency is required.

Also run the existing unit/database and Phase 4/VEO browser suites, then
`npm run build:check` for TypeScript and a production build into the ignored
`.veo-build-check/` directory. No migrations or production services are needed.

## Unresolved decisions remain unchanged

Retain existing training qualities and calculations. Summary defaults and Marcos's
attendance correction remain pending Susan's confirmation. VEO presentation
adoption waits for its separate review. No test-session archiving is needed.
No operational rule is decided by a visual token or synthetic fixture.

## Batch validation results

- 95 existing unit/database tests passed.
- 24 existing Phase 4 browser tests passed.
- 8 existing VEO browser regressions passed.
- 8 design-system browser tests passed, with external HTTP requests blocked.
- TypeScript and the production build passed. Existing Vite CJS deprecation and
  large-chunk warnings remain; they are outside this design-foundations batch.
- Production output inspection found neither the reference entry nor premium
  component/style markers in the built application assets.
- Mobile and desktop screenshots were inspected locally. No dependencies were
  installed, no production data was accessed or changed, and no Git mutations
  or deployment were performed.
