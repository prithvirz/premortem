# Tasks: Milestone 2

- [x] 0. Browser smoke test of M1 workbench (10/11 passed; the only failure was a missing favicon, fixed with `public/icon.svg`)
- [x] 1. Expose secret-free normalized models from `analyze()` (additive)
- [x] 2. Unified graph model, finding overlay, deterministic shared layout (`lib/viz/graph.ts`)
- [x] 3. View projection for Before / Changes / After (`lib/viz/view.ts`)
- [x] 4. Visual mapping: severity glyphs, distinct edge strokes, node badges (`lib/viz/visuals.ts`)
- [x] 5. Timeline and summary derivation (`lib/viz/timeline.ts`, `summary.ts`)
- [x] 6. Tests for graph, view, mapping, timeline, summary (`tests/viz.test.ts`, 21 tests)
- [x] 7. React Flow canvas with custom service/network nodes and risk edges
- [x] 8. Evidence inspector (finding / node / edge / overview)
- [x] 9. Incident timeline with step navigation, go-to, inspect
- [x] 10. Summary strip, legend, scenario cards, collapsible editors, error panel
- [x] 11. Theme, reduced motion, keyboard, mobile layout
- [x] 12. Browser verification script `npm run smoke` (36 checks, desktop + mobile + keyboard, prod build)
- [ ] Next: CodeMirror editors, shareable redacted report, a11y audit with a screen reader, blog
