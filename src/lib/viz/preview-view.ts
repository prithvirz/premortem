import type { GraphModel } from "./graph";
import { viewGraph, type ViewGraph } from "./view";

export interface PreviewGraph {
  view: ViewGraph;
  /** Edges that are at risk now and would be intact with the proposed AFTER. */
  restoredEdgeIds: string[];
}

/**
 * Show the proposed AFTER on the current layout, marking what the preview restores.
 * Only engine-derived models are compared; a relationship counts as restored only when the
 * proposed model has it without any risk.
 */
export function previewGraph(current: GraphModel, proposed: GraphModel, takeover?: { from: string; to: string }): PreviewGraph {
  const pos = new Map(current.nodes.map((n) => [n.id, n.position]));
  // A confirmed replacement takes the place of the ghost it replaces, so reconnected edges keep their shape.
  if (takeover && pos.has(takeover.from) && !proposed.nodes.find((n) => n.id === takeover.from && (n.inAfter || n.ghostAfter))) {
    pos.set(takeover.to, pos.get(takeover.from)!);
  }
  const aligned: GraphModel = {
    nodes: proposed.nodes.map((n) => ({ ...n, position: pos.get(n.id) ?? n.position })),
    edges: proposed.edges,
  };
  const view = viewGraph(aligned, "after");

  const cur = new Map(current.edges.map((e) => [e.id, e]));
  const brokenSources = new Set(current.edges.filter((e) => e.presence.after && (e.risk === "broken" || e.risk === "at-risk")).map((e) => e.source));
  const restored: string[] = [];
  for (const e of view.edges) {
    if (e.kind === "membership" || e.kind === "lost-network" || e.risk) continue;
    const before = cur.get(e.id);
    const wasAtRisk = before?.presence.after && (before.risk === "broken" || before.risk === "at-risk");
    const replacesBroken = !before?.presence.after && brokenSources.has(e.source);
    if (wasAtRisk || replacesBroken) {
      e.visual = "restored";
      e.label = e.id.startsWith("e:depends_on:") || e.id.startsWith("e:links:") ? (wasAtRisk ? "shared network restored" : "reconnected") : "restored";
      restored.push(e.id);
    }
  }

  const curMembership = new Set(current.edges.filter((e) => e.kind === "membership" && e.presence.after).map((e) => `${e.source}|${e.target}`));
  for (const n of view.nodes) {
    for (const t of n.networks) if (!curMembership.has(`${n.id}|${t.id}`)) t.state = "proposed";
  }
  return { view, restoredEdgeIds: restored };
}
