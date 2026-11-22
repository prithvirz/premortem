# Architecture

PreMortem is a static Next.js app. All analysis is pure TypeScript that runs in the browser; there is no backend, database, or API route.

```
 BEFORE.yml ─┐                           ┌─ Finding[] (basis, severity, confidence, evidence, relationships)
 AFTER.yml  ─┼─▶ lib/compose ── analyze ─┼─ ComposeDiff (neutral structural diff)
 policy.yml ─┘   parse → normalize →      └─ models (secret-free normalized BEFORE/AFTER)
                 rules[]                          │
                                                  ▼
                          lib/viz ── graph model (one dagre layout for BEFORE∪AFTER)
                                     view(mode) · highlight · headline · timeline · summary
                                                  │
                          lib/fix ── proposeFix → patch (offset splice + verify) → previewFix (re-analyze)
                                                  │
                          components/observatory ── React Flow canvas, inspector, change story, risk list
```

## Layers

| Path | Responsibility | Notes |
| --- | --- | --- |
| `src/lib/compose/parse.ts` | YAML 1.2 parse with limits; normalize to a secret-free model | Never throws; env values stored only as `set`/`empty`/`passthrough`/`interpolated` |
| `src/lib/compose/graph.ts` | Effective networks, Docker-name identity, reachability | `network_mode` other than `service:X` → "unknown" |
| `src/lib/compose/rules/*` | One function per rule family | Each returns findings with separate `confirmedChange` and `possibleConsequence` |
| `src/lib/compose/analyze.ts` | Run rules, sort, attach diff and models | Pure and synchronous |
| `src/lib/viz/*` | Graph model, views, highlight, headline, timeline, summary, preview view | Pure; all UI numbers come from here |
| `src/lib/fix/*` | Fix eligibility, minimal patches, reanalysis, redacted diff | Declines anything it cannot patch reliably |
| `src/components/observatory/*` | Rendering and interaction only | React Flow 13, Tailwind 4 |

## Guarantees enforced by tests

- Node positions are identical across Before, Changes, After, and Proposed views.
- The BEFORE view never shows risk. Port and policy findings never draw broken edges.
- Info findings never restyle or hide a declared relationship.
- Fix patches change only the intended lines; a semantic check rejects anything else.
- A warning is "cleared" only when the engine no longer reports its id.
- No secret value from the inputs appears in findings, diffs, or the rendered page.
- Example files agree with Docker Compose expectations (`validation/expected.json`); CI checks them with real Docker.

## Tests

| Suite | Count | Command |
| --- | --- | --- |
| Unit (Vitest) | see `npm test` | `npm test` |
| UI browser checks | 56 | `node scripts/smoke.mjs` |
| Fix preview end-to-end | 63 | `node scripts/smoke-fix.mjs` |
| Accessibility (axe-core, 8 states) | 0 violations required | `node scripts/a11y.mjs` |
| Docker ground truth (CI) | 13 | `node validation/run.mjs` |
