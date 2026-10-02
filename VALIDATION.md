# Care Buddy refined v1.1 validation and handoff

Verified on 30 September 2026 using Chromium 153 (Playwright). Source: supplied v1.1 PDF and approved PWA/skill plan. This is a separate friends' synthetic demo.

## Observed results

- Production TypeScript check and Vite build succeeded. Built app is in `dist/`.
- 31 browser tests passed, 0 failures, 0 skipped, including AC01–AC20.
- 27 domain unit tests passed, 0 failures.
- 28 local WorkBuddy proposal-script guard checks passed. Three packages passed current WorkBuddy Open Platform metadata and ZIP integrity checks; ZIP SHA256 checks passed. Actual WorkBuddy client import remains unverified.
- Dependency audit reported 0 known vulnerabilities.
- Root independently reproduced the offline failure, verified its Vary: Origin cause and rechecked offline deep-route reopening after the correction.
- Independent review identified contextual benefit, preparation-time, recurrence, provenance and navigation gaps. Corrected behaviours have regression coverage.
- Fresh CodeGraph index and source/caller/callee checks completed. Application types are `src/types.ts`; copied WorkBuddy reference types are documentation, not app execution types. This is bounded traversal, not a claim of exhaustive code coverage.
- A bounded source scan found no private-key blocks, credential assignments, real telephone links or external font URLs. Gitleaks is unavailable; this does not claim a full security audit.

## Acceptance results

| Browser acceptance case | Result |
| --- | --- |
| AC01 start and reset restore fixed fixtures | PASS |
| AC02 reported completion and undo preserve tomorrow | PASS |
| AC03 snooze persists without schedule change and rejects past | PASS |
| AC04 reminder CRUD, validation and dirty discard | PASS |
| AC05 profile isolation and pending cancellation | PASS |
| AC06 view access, dependent add/remove | PASS |
| AC07 Maya checklist persistence and preparation reminder | PASS |
| AC08 conditional/unknown benefits and unverified notes | PASS |
| AC09 scripted chat, ambiguity, cancel and limitations | PASS |
| AC10 GP preview explicitly unsent | PASS |
| AC11 urgent simulation viewed only | PASS |
| AC12 car restriction, navigation guard and conservative reload | PASS |
| AC13 save failure, retry, corrupt schema and missing targets | PASS |
| AC14 widths, zoom, keyboard focus, contrast and reduced motion | PASS |
| AC15 no outbound calls, injection or real permission/PII fields | PASS |
| AC16 state persistence, duplicate submit and invalid IDs | PASS |
| AC17 welcome reopen preserves saved changes | PASS |
| AC18 tonight-only bedtime override before/after and reload | PASS |
| AC19 caregiver attribution, skipped undo and receipt fields | PASS |
| AC20 appointment origin and benefit distinctions | PASS |
| AC13 empty day and removed notification target | PASS |
| AC18 cancelled bedtime and failed proposal retry update once | PASS |
| AC12 honest unavailable browser audio and privacy preferences persistence | PASS |

The additional browser cases cover empty/missing targets, repeated confirmation, real storage-write failures, bedtime cancellation, contextual sample benefits, recipient selection, accessibility across eight routes, unsupported audio and preference persistence, offline reopening, and actual service-worker replacement/cache cleanup.

## Visual and accessibility evidence

Actual browser screenshots: `evidence/today-320.png`, `today-390.png`, `today-768.png`, `today-1440.png`, `text-200-percent.png`, `zoom-200-percent.png`, `urgent.png`, `driving.png`, `buddy-receipt.png`, `offline-benefits.png`.

Root inspected the phone, desktop, 200% reflow and driving captures. The 390px appointment layout was corrected after inspection. Fixed navigation appearing partway through a full-page screenshot reflects its viewport position; browser tests confirm controls remain usable after scrolling. WCAG A/AA automated checks pass across eight routes; keyboard focus trapping and restoration were exercised. 200% verification uses text scaling and browser reflow emulation. Native browser zoom controls and physical device installation have not been exercised.

## Run and demo

Use Node.js 22.12+; Node.js 24 LTS is suitable. In this folder: `npm ci`, `npm run build`, `npm run preview`. Open http://127.0.0.1:4173. Use `npm run dev` for editing. Tests: `npm test`; `npx playwright install chromium` if needed; `npm run test:e2e`; `node scripts/test-skills.mjs`.

Presenter sequence: Get started → record morning medication → inspect receipt and Undo → Buddy, “Move my bedtime reminder to 10:30 tonight” → Tonight only → review before/after → Confirm → verify tomorrow unchanged → Maya screening → sample benefit → return to appointment. Use Settings for failed-save, unknown-benefit, urgent-help, car/privacy and clock scenarios. Restore with Reset local records.

To share with friends, use the source archive. Serve `dist/` at the root of an HTTPS origin to install on phones; provide an SPA fallback to `index.html` for online deep links. Service worker supplies offline navigation after the first successful load. No public hosting was performed. Opening index.html directly from the filesystem does not provide PWA installation or service-worker support.

## WorkBuddy and product boundaries

Three importable preparation ZIPs and their source live under `workbuddy-skills/`; check `SHA256SUMS`. Each deterministic script accepts fictional state from stdin, checks recipient/access/clock/source, and returns a proposal or source-labelled explanation with `executed:false`. No host integration or app mutation occurs. WorkBuddy import and AI runtime execution are unverified; the scripted PWA never calls an LLM. Future integration must obtain user confirmation and revalidate against current app state before executing.

This version organises care and offers routine GP previews. It does not assess symptoms or implement clinical routing, so stronger self-triage/navigation challenge alignment remains future work. The official judging rubric was not supplied. No winning probability or medical validity is claimed.

All data is fictional and browser-local. No login, patient data, real booking, insurance adjudication, emergency dispatch, push, vehicle pairing, production backend or device permissions. The app remains outside WhiteCoat records because organisational ownership has not been established.

## Evidence files

`evidence/playwright-results.json`, `evidence/playwright-report/index.html`, `evidence/unit-tests.json`, `evidence/skill-tests.txt`, `evidence/dependency-audit.json`, `evidence/source-checks.json`, `evidence/codegraph-status.json`. Re-run tests after changing source; do not treat this report as evidence for a later revision.

## Product refinement — latest verified revision

Current user request supersedes the original repeated demo badge, scripted-assistant chrome and canned weather fixture. Those were removed from ordinary screens; a clear fictional-data/local-execution disclosure remains in About Care Buddy. The WorkBuddy tagline was removed because no live runtime connection exists. Family profiles were retained: “members of demo” was interpreted as “mentions of demo,” with an optional clarification left unanswered.

Today uses current clock/date/counts, a compact profile bar, ordered reminders and a two-column desktop canvas. Buddy now uses current appointment/checklist/benefit/reminder records; its local rules can create explicitly requested ordinary routines, propose reports/snoozes, and show a day summary. Preparation time follows the actual appointment rather than a profile ID. Existing active preparation is reused; linked reminders must precede the appointment. Bedtime recurrence scope, permissions, cancellations, errors and truthful receipts remain enforced.

Settings exports current fictional context and imports an unexecuted reminder proposal. Import validates recipient, current clock, allowed command, recurrence scope, source snapshots and action ID. Current sources are checked again before confirmation. A real package script was exercised through browser export/import/confirm/receipt and duplicate/stale refusal. This is a manual local JSON roundtrip, not WorkBuddy runtime execution.

Independent QA in evidence/polish-independent-QA.md and polish-independent-readback.txt found and rechecked stale receipts, reminder ordering and ineffective error Retry. Final production regression: 31/31 browser tests, 27/27 unit tests, 28 package guard checks, three target-format metadata/ZIP checks. Automated WCAG A/AA, 320/390/768/1440 layouts, text/reflow scaling, reduced motion, offline deep-route reopening and actual worker replacement remain passing. Native browser zoom controls, physical phones and actual WorkBuddy client remain untested.

See HACKATHON-WORKBUDDY.md for the organizer/product/platform source matrix, package requirements, recommended capabilities and unresolved Challenge 1 fit. This product is closer to long-term self-care; no clinical routing was invented and no team registration changed.
