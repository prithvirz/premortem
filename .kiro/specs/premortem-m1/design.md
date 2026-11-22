# Design: Milestone 1, Comparison Engine

## Architecture
Pure TypeScript library in `src/lib/compose/`, no I/O, usable in the browser, Node, and tests.

```
YAML text -> parseYamlSafely -> normalizeCompose -> NormalizedCompose (secret-free)
                                                         |
BEFORE + AFTER + optional policy -> rules[] -> Finding[] -> sorted AnalysisReport
                                  \-> diffCompose -> ComposeDiff (neutral, for M2 timeline)
```

| File | Role |
| --- | --- |
| `types.ts` | Model, `Finding`, `Evidence`, `Relationship` |
| `parse.ts` | YAML safety limits, normalization, network identity |
| `ports.ts` | Short/long port syntax, ranges |
| `graph.ts` | Effective networks, declared links, evidence helpers |
| `rules/*.ts` | One function per rule family, `(ctx) => Finding[]` |
| `policy.ts` | Required-env policy validation |
| `diff.ts` | Structural diff |
| `redact.ts` | Redaction |
| `analyze.ts` | Orchestration, ordering, limitations |

`src/lib/examples/scenarios.ts` holds three scenarios with expected results. `src/components/Workbench.tsx` is a deliberately plain UI shell (M2 replaces it).

## Compose semantics applied
- No `networks` key means `default`. `network_mode: host|none|service:X` replaces `networks`.
- Network identity: `external:<name>`, `named:<name>`, or `project:<key>`.
- Published ports expose container ports on the host. Service-to-service traffic uses the container port over a shared network. Host-port findings mark dependents `unaffected`; only a container-port change marks them `at-risk`.
- Compose rejects undefined `depends_on`/`links`/network targets, so those findings use basis `compose-validation`. Everything else is `inferred` or `policy`.

## Severity and confidence
- critical: Compose is expected to reject the file.
- high: declared relationship likely broken (shared network lost with `depends_on`; container port changed with dependents; required variable gone).
- medium: external-facing change or removed relationship. low/info: weak or no declared evidence.
- Confidence is separate from severity and always comes with an uncertainty list.

## Noise control
- Unrelated services that lose a shared network are aggregated into one `info` finding per service.
- A dangling reference already present in BEFORE is not a change and is not reported.
- Unresolved ports, ephemeral host ports, and removed services are skipped instead of guessed.

## Error handling
`parseCompose` and `analyze` never throw. YAML error messages are truncated to the first line (later lines quote source) and redacted.
