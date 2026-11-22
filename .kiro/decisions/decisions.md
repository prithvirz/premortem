# Decision log

## D1: Own the normalized model; do not use `docker compose config`
Running Docker would break the "no Docker, no execution, browser-local" requirement. Cost: we reimplement a subset of semantics and state the limits.

## D2: Separate confirmed change from possible consequence
Every finding has `confirmedChange` (fact from the files) and `possibleConsequence` (hedged), plus `basis` and a confidence/uncertainty block. This enforces "no invented runtime failures" in the data model, and tests assert the hedged wording.

## D3: Never store environment values
The model stores only `EnvState` (set, empty, passthrough, interpolated). Redaction is a second layer for evidence strings. This removes the leak class instead of filtering it.

## D4: Network identity, not key equality
Two keys with the same `name:` are one network; `external` is distinct from project-scoped. Prevents false positives on key renames.

## D5: Published ports are not connectivity
Host port removal or change never marks internal dependents as broken. Only a container-port change can put dependents at risk.

## D6: Do not report pre-existing problems
A dangling reference identical in BEFORE and AFTER is not a change. Keeps the tool about the diff.

## D7: Aggregate unrelated network isolation as `info`
Segmentation is commonly intentional; one low-confidence finding per service avoids N-squared noise.

## D8: `yaml` package (eemeli/yaml)
Maintained, YAML 1.2 (so `22:22` stays a string), anchors/merge keys, duplicate-key detection, alias limit, no code execution.

## D9: TypeScript 5.9, not 7
Next 16's toolchain targets the 5.x compiler API.

## D10: Defer React Flow to M2
Milestone 1 has no graph UI. Findings already carry `relationships` for the graph to consume.

## D11: One unified graph, three projections
The BEFORE+AFTER union is laid out once with dagre; views only filter and restyle. Guarantees stable positions (tested) and makes the toggle meaningful.

## D12: Draw risk only from finding relationships
Edges turn red/amber only when a finding's relationship is `broken`/`at-risk`. Port and policy findings badge nodes instead. Prevents the graph from implying failures the engine did not support.

## D13: Undeclared isolation is hidden by default
Info-level network-lost findings get an `isolated` state, drawn only when selected. They are context, not evidence of breakage.

## D14: Never color alone
Severity has glyph + label; each edge state has a distinct dash pattern and a label glyph (✕ ! ∅ + −).

## D15: playwright-core with system Edge for browser checks
No browser download; `npm run smoke` drives the installed Edge against a running server. Kept as a script rather than a test-runner dependency.

## D16: Network tags instead of membership curves
Membership curves crossed every service and carried little information. Each service now lists its networks as tags (kept, + joined, − left), and a network strip lists all networks with member counts. Compose semantics are preserved: implicit `default` is labeled, external networks are marked, and `network_mode` is shown as a label, never as a fake membership.

## D17: Highlight explains the cause
For network findings the highlight marks the network that was shared in BEFORE and not in AFTER as "lost", and the involved services' other networks as "related". Before, selection dimmed exactly the information needed to understand the finding.

## D18: Severed only for configuration-level breaks
Edges get a deliberate gap with end caps only when a finding marks the relationship `broken`. Inferred `at-risk` edges stay dashed and are labeled "possibly". The headline qualifier always states the basis.

## D19: Remount the canvas per analyzed model
React Flow's own initial fit, run after node measurement, was the only reliable fit when switching scenarios. The canvas remounts when the unified model changes; view toggles do not remount, so positions and camera stay stable.

## D20: Mobile defaults to a risk list
At 390px a full topology graph is unreadable. The list shows affected relationships first, then services by severity, with the same tags and badges. The graph stays one tap away and opens on the top risk.

## D21: Offset splicing plus semantic verification for patches
Full re-serialization changed unrelated lines, so patches splice text at parser offsets. Every patch is re-parsed and compared with the intended mutation; any mismatch declines the fix.

## D22: Decline rather than guess
Anchors, aliases, merge keys, `include`, `extends`, interpolation, multiple documents, network_mode conflicts and duplicate references all decline with a reason. Policy and port findings never get automatic fixes, because the correct value is unknowable.

## D23: Cleared means "the engine no longer reports this id"
Preview results compare finding ids between the current and proposed analysis. Wording is limited to "Configuration warning cleared after reanalysis" or "remains".

## D24: Fix-level reachability warning instead of a new rule
Retargeting to a service on another network clears the dangling-reference warning, but the network rule only compares services present in both versions. Rather than add a detection rule (out of scope), the proposal checks reachability and shows a prominent warning.

## D25: Apply is two-step, AFTER-only, undoable once
Preview never mutates editors. Apply requires a second confirmation, touches only AFTER, and offers one undo. Editing a file discards a stale preview.
