# Design: Milestone 2

## Layers
```
analyze() (unchanged engine, now also returns secret-free `models`)
  -> lib/viz/graph.ts     buildGraphModel: unified BEFORE+AFTER graph, finding overlay, dagre layout (once)
  -> lib/viz/view.ts      viewGraph(model, mode): filter + visual state per view; positions untouched
  -> lib/viz/timeline.ts  buildTimeline: change steps, then finding steps
  -> lib/viz/summary.ts   summarize: counts, basis split, unknowns
  -> lib/viz/visuals.ts   severity glyphs, edge stroke specs, node badges
components/observatory/  Observatory (state), GraphCanvas, Inspector, Timeline, SummaryStrip, Legend, ComposeEditors
```
Everything under `lib/viz` is pure and unit-tested. Components only render it.

## Key mappings
| Engine fact | Visual |
| --- | --- |
| relationship `broken` (depends_on/links/network_mode) | red dashed edge, "✕" label |
| relationship `at-risk` | amber short-dash animated edge, "!" label |
| network-lost with no declared link (info) | violet dotted edge, hidden until selected |
| `network` relationship with no declared edge | synthetic `lost-network` edge |
| service only in BEFORE / undefined target | ghost node "☽", dashed border, struck name |
| diagnostics with `service` | "? Unresolved" badge and "Not analyzed" in inspector |
| `basis` | tag: Compose validation / Inferred / Your policy |

## Layout
dagre runs once (LR), on services and declared dependency edges from both versions. Networks go in a band below, at the mean x of their members, with collision push. The graph re-fits only when the unified model changes, not on view toggles.

## Interaction
Nodes are controlled (`nodesDraggable=false`). Mouse selection uses `onNodeClick` / `onEdgeClick` and edge-label buttons. Keyboard selection arrives through `onNodesChange` / `onEdgesChange` select changes (React Flow 13 changesets). The current selection or step highlights its nodes and edges and dims the rest.
