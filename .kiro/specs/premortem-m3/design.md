# Design: What-if Fix Preview

```
Finding ──proposeFix──▶ FixOffer (eligible + options | declined + reason)
                          │  each option carries a verified patchedAfter
                          ▼
            previewFix(input, report, findingId, option)
                          │  analyze(BEFORE, patchedAfter)   ← existing engine, unchanged
                          ▼
            FixPreview: targetCleared, cleared / remaining / introduced, verdict, redacted line diff
                          │
            previewGraph(currentModel, proposedModel, takeover?)
                          ▼
            proposed view on the current layout: restored edges, proposed tags
```

| File | Role |
| --- | --- |
| `lib/fix/patch.ts` | `attachNetwork`, `retargetDependency`: safety gates, offset-based splices, semantic verification |
| `lib/fix/proposals.ts` | Eligibility, options, disclosures, warnings, confirmation text |
| `lib/fix/preview.ts` | Reanalysis, finding-id comparison, verdict wording, LCS line diff (redacted) |
| `lib/viz/preview-view.ts` | Proposed view aligned to current positions, restored and proposed marking |
| `components/observatory/FixPanel.tsx` | Offer, options, confirmation, preview result, Discard, two-step Apply |

## Why text splicing
Re-serializing with the `yaml` library changed unrelated lines (comment spacing, flow padding). Splicing at parser-reported offsets keeps everything else identical. A semantic check (re-parse, then deep-compare with the expected JS mutation) turns any splicing mistake into a refusal instead of a silent change. During development it caught two real offset bugs.

## Edge cases handled
- A service with no `networks` key gets `[default, X]`, so it does not silently lose the implicit default.
- Block nodes report end offsets after their newline; insertion points step back to the last content.
- `links: [postgres]` becomes `database:postgres`, keeping the old hostname as an alias.
- Retargeting a map-form `depends_on` keeps `condition` and other settings.
- The confirmed replacement takes the ghost's position in the preview graph.
