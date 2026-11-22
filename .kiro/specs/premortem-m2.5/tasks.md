# Milestone 2.5: Signature visual experience and UX corrections

Baseline checkpoint: commit `6ae7dcf` (M1 engine + M2 observatory, 87 tests, smoke 36/36).

## Requirements (EARS)
- R1 WHEN the analysis has a non-info finding, THE verdict SHALL name the affected services (e.g. `api → redis: shared network lost`) and state its basis (validation / inferred / policy).
- R2 WHEN a network-related finding, its edge, or its timeline step is selected, THE SYSTEM SHALL keep the involved services and their networks lit and mark the network that was shared and lost. Unrelated services SHALL dim.
- R3 Network membership SHALL be shown as tags on services and a network strip, not as canvas curves. `network_mode` SHALL be labeled instead of drawn as membership.
- R4 Changed services SHALL show specific change badges (e.g. `Networks changed`), never a generic `Changed`.
- R5 Broken relationships SHALL be drawn severed (visible gap with end caps). Inferred at-risk relationships SHALL NOT be severed.
- R6 Removed services SHALL render as ghosts of their BEFORE state. Added services SHALL be visually distinct. Unresolved settings SHALL show labeled fog.
- R7 Severity colors SHALL be identical everywhere. Zero counts SHALL be neutral. High/critical findings SHALL outweigh info context, which is grouped and collapsed.
- R8 On screens ≤639px, a service-and-risk list SHALL be the default. The graph SHALL remain available, open on the top risk at a readable zoom. The legend SHALL be collapsible.
- R9 Touch targets SHALL be at least 32px tall. Reduced motion SHALL disable all animation.

## Tasks
- [x] 0. Harden `.gitignore`; baseline commit
- [x] 1. `lib/viz/headline.ts`: service-named verdict (tests)
- [x] 2. `lib/viz/highlight.ts`: network-aware highlight, lost vs related networks (tests)
- [x] 3. `view.ts`: network tags with kept/added/removed per view; network_mode labels (tests)
- [x] 4. `graph.ts`: change kinds; network_mode changes count as network changes (tests)
- [x] 5. `visuals.ts`: specific change badges, canonical severity colors, severed spec (tests)
- [x] 6. Canvas: no network nodes or membership curves; severed edge with end caps; ghost, materialize, fog styles
- [x] 7. Compact header with scenario chips; verdict bar; graph-first layout sized to graph aspect ratio
- [x] 8. Network strip with emphasis states
- [x] 9. Inspector hierarchy: weighted findings, collapsed context, neutral zeros
- [x] 10. Rename timeline to "Deployment change story"
- [x] 11. Mobile risk list (default), optional graph opening on the top risk, collapsible legend
- [x] 12. Smoke suite rewritten: 56 checks incl. fit-in-canvas, label/node overlap, touch targets, emphasis, no secrets
- [x] 13. Review screenshots in `.agents/screenshots/review-m2.5/`
