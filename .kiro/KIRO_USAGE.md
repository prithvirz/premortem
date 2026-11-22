# How Kiro assisted development (competition record)

Update this file as the project proceeds. Entries are factual.

## Milestone 1
- Spec-driven: requirements (EARS), design, and tasks live in `.kiro/specs/premortem-m1/`.
- Kiro inspected the environment (Node 26, npm 12, empty repo) and proposed the architecture in `design.md`.
- Kiro implemented the engine, tests, and docs in one session and ran `npm test`, `tsc --noEmit`, and `next build`.
- Design decisions are logged in `.kiro/decisions/decisions.md`.
- The type checker caught one mistake: `maxAliasCount` is a `toJS` option, not a `parseDocument` option. Fixed.

## Milestone 2
- Kiro ran a real browser smoke test (Playwright driving headless Edge) on the M1 workbench before starting. All functional checks passed; one console 404 (favicon) was fixed.
- Specs in `.kiro/specs/premortem-m2/`, decisions D11 to D15.
- The pure `lib/viz` layer was written test-first-adjacent: 21 tests on graph, view, mapping, timeline, and summary.
- Browser checks found real bugs that unit tests could not catch, and Kiro fixed each:
  - Edge labels were unclickable: another edge's hit area covered them. Fixed with label-layer z-index.
  - Keyboard Enter on a node did nothing: React Flow 13 reports controlled selection via changesets. Switched to `onNodesChange`.
  - Switching scenarios did not re-fit the graph (nodes clipped). Re-fit keyed on the unified model.
  - Low-confidence "isolated" labels cluttered the graph and covered node names. Hidden until selected.
  - Summary verdict said "relationships may break" for a policy-only high finding. Verdict now uses relationship evidence.
- Screenshot review by Kiro drove the layout fixes above.

## Milestone 2.5
- Kiro hardened `.gitignore` and created the baseline commit before changing anything.
- Kiro wrote the review audit from real production screenshots, then turned it into requirements in `.kiro/specs/premortem-m2.5/`.
- New pure logic (headline, network-aware highlight, network tags, change kinds) got 16 unit tests before the UI used it. One test expectation was wrong (4 more findings, not 3) and was corrected after checking the scenario.
- Browser checks caught bugs that unit tests could not, and Kiro fixed each:
  - After a scenario switch the graph was clipped. Two attempted fixes (re-fit on measurement, delayed double fit) were measured in the browser and failed; remounting the canvas per model fixed it. A fit-in-canvas check now guards it.
  - Lost-network emphasis rings showed on dimmed services. Emphasis now only applies to lit nodes.
  - Timeline buttons were 26px tall on mobile. Raised to 36px.
  - The zoom "fit" button was covered by the React Flow attribution. Controls moved to the left.