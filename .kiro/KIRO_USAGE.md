# How Kiro was used to build PreMortem

This is a factual record for the Kiroween 2026 submission. It describes what Kiro did, what it found, and which Kiro features were and were not used.

## Setup and working model

- **Tool:** the Kiro agent in Kiro IDE, working in this repository through its built-in tools: shell commands (PowerShell on Windows), file reading and editing, and viewing images (used to review real screenshots).
- **Working model:** the author wrote a brief for each milestone and reviewed the result. Kiro planned, implemented, tested, and reported, then stopped for approval. There were six milestones: M1, M2, M2.5, M3, M3.1, and release preparation. Each approved milestone was committed locally before the next began.
- **Author decisions** (scope, design direction, approval or rejection of each milestone) are reflected in the briefs. Kiro did not push, publish, or deploy anything.

## Kiro features: used and not used

| Feature | Used? | Notes |
| --- | --- | --- |
| Agent chat with tools (shell, files, image viewing) | Yes | All implementation and verification |
| Specs in `.kiro/specs/` | Yes, as files | Requirements (EARS), design, and tasks per milestone, written by Kiro from the author's briefs, mostly during or after each milestone rather than before coding. See [specs/README.md](specs/README.md). |
| Decision log in `.kiro/decisions/` | Yes | 31 numbered decisions with reasons |
| Steering | User-level only | The author's global steering (Windows PowerShell quoting guidance, workflow-launch preference) shaped how commands were run. This repository has no project steering files. |
| Agent hooks | No | None configured |
| MCP servers | No | None configured or used |
| Multi-step workflows / subagents | No | All work happened in one agent session per milestone |
| Web search | No | Package versions were checked with `npm view`; library APIs were read from installed type definitions |

## What Kiro did, milestone by milestone

### M1: Comparison engine
- Inspected the environment (empty folder, Node 26, npm 12) and checked current package versions with `npm view` before choosing the stack.
- Designed a pure, browser-safe engine with secret-free normalization and wrote 66 tests across parser, rules, and scenarios.
- The type checker caught one Kiro mistake (`maxAliasCount` belongs to `toJS`, not `parseDocument`).

### M2: Observatory UI
- Ran a real browser smoke test (Playwright driving headless Edge) of the M1 workbench first; fixed a missing favicon that produced a console error.
- Built React Flow graph, view, and timeline logic as pure, tested modules (21 tests), then the UI.
- Browser checks found bugs unit tests could not, and Kiro fixed each: unclickable edge labels (covered by another edge's hit area), keyboard Enter doing nothing (React Flow 13 reports controlled selection through changesets), clipped graphs after a scenario switch, cluttering labels, and a verdict that overstated a policy-only finding.

### M2.5: Signature visuals and UX corrections
- Hardened `.gitignore` and committed the baseline before changing anything.
- Captured real production screenshots, wrote a design audit from them, and turned it into requirements.
- Replaced membership curves with network tags, made the verdict name services, and made selection highlight the *lost* network instead of dimming it. Added severed edges, ghost services, and labeled fog for unknowns, plus a mobile risk list.
- The graph-fit-after-switch bug resisted two attempted fixes. Kiro measured each one in the browser, and the third approach (remount per model) worked. A fit-in-canvas browser check now guards it.

### M3: What-if Fix Preview
- Measured how the YAML library round-trips the scenario files before choosing a patch strategy. Full re-serialization changed unrelated lines, so Kiro used offset splicing plus semantic re-verification.
- 35 tests caught an off-by-one-line insertion after nested blocks, which verification had correctly refused, and a reversed diff order.
- Found a coverage gap: retargeting to a service on another network cleared the warning but reported nothing new. It was recorded and closed in M3.1.
- Screenshot review found reconnected edges looping through the replacement node. Fixed by placing the confirmed replacement in the ghost's position.

### M3.1: Coverage and release audit
- Added the narrowly scoped `dependency-unreachable` rule (23 tests) without duplicating existing rules.
- Found and fixed a related bug: `external: true` and `name: X` were treated as different networks although both mean Docker network X.
- Screenshot review caught three presentation errors that tests had missed (success color despite a new risk, off-frame services, dimmed cause networks). All three are now guarded by browser checks.
- Ran axe-core (WCAG 2.1 A/AA) on eight UI states. Fixed accessible-name mismatches, the missing `main` landmark, and a heading skip; 0 violations remain. **No real screen reader was available, so screen-reader behavior is unverified.**

### Release preparation
- Scanned every commit for secrets, tokens, local paths, and personal emails (none found), and audited dependency licenses (all bundled code is permissive). Moved two bundled libraries from devDependencies to dependencies.
- Exported the scenarios as real Compose files with Docker expectations, and added a unit test that the static engine agrees with them.
- Added a GitHub Actions job that checks the files with real Docker Compose, including a DNS test that `depends_on` does not connect separate networks. **Docker was not available on the development machine and nothing has been pushed, so this job has not run yet.**

## Verification Kiro ran

| Check | Tool |
| --- | --- |
| Unit tests | Vitest (`npm test`) |
| Types | `tsc --noEmit`, strict mode |
| Production build | `next build` |
| UI and fix-preview end-to-end | Playwright (`playwright-core`) driving installed Edge against `next start` |
| Accessibility | axe-core injected into the production page |
| Visual review | Real screenshots viewed by Kiro after each change |
| Docker ground truth | `validation/run.mjs` in CI (prepared, not yet run) |
