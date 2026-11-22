# Milestone 3.1: Network risk coverage and release audit

## Requirements (EARS)
- R1 WHEN AFTER declares `depends_on` or `links` between two defined services that share no Compose network, and the pair did not share a network in BEFORE, THE SYSTEM SHALL report `dependency-unreachable` as an inferred risk (medium for depends_on, high for links). It SHALL NOT be a Compose validation error.
- R2 The finding SHALL explain that depends_on controls start order, not communication.
- R3 Pairs that shared a network in BEFORE SHALL be left to `network-lost` (no duplicates). Missing targets and undeclared networks SHALL be left to their existing rules.
- R4 WHEN the same relationship was already disconnected in BEFORE, THE SYSTEM SHALL report it as info ("unchanged from BEFORE"), never in the headline, and never restyle or hide the edge.
- R5 Implicit `default`, named (`name:`), and external networks SHALL be compared by Docker network name. `network_mode: service:X` SHALL inherit X's networks. host/none/bridge/container:* SHALL yield a low-confidence "not analyzed" note, never a failure.
- R6 WHEN a preview clears its target but introduces a non-informational finding, the verdict SHALL say "Configuration warning cleared after reanalysis, but N new risk(s) detected", SHALL be styled as a warning, and SHALL show a tally such as "1 resolved · 1 new risk · 0 other risks still reported".
- R7 WHEN a preview opens, the finding title, chosen correction, and reanalysis verdict SHALL be in view.
- R8 Release: zero axe-core WCAG 2.1 A/AA violations in key states; no dead controls; no overflow from 360 to 1920 px; no secrets, tokens, personal data, or build artifacts in tracked files.

## Tasks
- [x] 0. Commit approved M3 (`032e8ae`)
- [x] 1. `graph.ts`: `dockerNetwork()` identity normalization in `sharesNetwork`; `reachability()` with an "unknown" result for special network modes
- [x] 2. `rules/unreachable.ts`: new, pre-existing (info), and unknown (info) cases; registered in `RULES`
- [x] 3. Graph label, headline, highlight, and fix-ineligibility for the new rule. Info findings attach to edges without restyling them.
- [x] 4. Removed the M3 fix-level reachability warning (D24); the engine now reports it
- [x] 5. Preview verdict, tally, `newRisk`; amber styling in the panel and toolbar; new-risk edges, services, and networks lit and framed
- [x] 6. Preview context line ("For: … / Previewing: …") and deterministic scroll to the panel header
- [x] 7. Tests: `tests/unreachable.test.ts` (23), the M3.1 preview scenario in `tests/fix.test.ts`
- [x] 8. Playwright: M3.1 scenario, scroll position, redacted diff context, toolbar styling, framing (smoke-fix 63 checks)
- [x] 9. Accessibility: axe-core audit script; fixed accessible-name/visible-text mismatches, added `<main>` landmark and graph heading
- [x] 10. Release review: tracked files, dead-control sweep, overflow sweep at 6 widths
