import type { Severity } from "../compose/types";
import type { GraphEdge, GraphModel, GraphNode, ViewMode } from "./graph";

export type NodeVisual = "steady" | "changed" | "added" | "removed" | "missing";
export type EdgeVisual = "steady" | "added" | "removed" | "broken" | "at-risk" | "isolated";

export interface ViewNode extends GraphNode {
  visual: NodeVisual;
  /** Severity badge, shown only for the AFTER-side views. */
  risk?: Severity;
  /** Removed in AFTER but still referenced by AFTER. */
  danglingTarget: boolean;
}

export interface ViewEdge extends GraphEdge {
  visual: EdgeVisual;
  label?: string;
}

export interface ViewGraph {
  nodes: ViewNode[];
  edges: ViewEdge[];
}

function nodeVisible(n: GraphNode, mode: ViewMode): boolean {
  const b = n.inBefore || n.ghostBefore;
  const a = n.inAfter || n.ghostAfter;
  return mode === "before" ? b : mode === "after" ? a : b || a;
}

function nodeVisual(n: GraphNode, mode: ViewMode): NodeVisual {
  if (mode === "before") {
    if (!n.inBefore) return "missing";
    return n.inAfter ? "steady" : "removed";
  }
  if (mode === "after") {
    if (!n.inAfter) return "missing";
    if (!n.inBefore) return "added";
    return n.changed ? "changed" : "steady";
  }
  if (n.inBefore && !n.inAfter) return "removed";
  if (!n.inBefore && n.inAfter) return "added";
  if (!n.inBefore && !n.inAfter) return "missing";
  return n.changed ? "changed" : "steady";
}

function edgeVisible(e: GraphEdge, mode: ViewMode): boolean {
  return mode === "before" ? e.presence.before : mode === "after" ? e.presence.after : true;
}

function edgeVisual(e: GraphEdge, mode: ViewMode): EdgeVisual {
  if (mode !== "before" && e.presence.after && e.risk) return e.risk;
  if (mode === "before") return e.presence.after ? "steady" : "removed";
  if (mode === "after") return e.presence.before ? "steady" : "added";
  if (e.presence.before && e.presence.after) return "steady";
  return e.presence.before ? "removed" : "added";
}

/** Project the unified model onto one view. Node positions never change between views. */
export function viewGraph(model: GraphModel, mode: ViewMode): ViewGraph {
  const edges: ViewEdge[] = model.edges
    .filter((e) => edgeVisible(e, mode))
    .map((e) => {
      const visual = edgeVisual(e, mode);
      const label =
        visual === "broken" || visual === "at-risk" || visual === "isolated"
          ? e.riskLabel
          : visual === "removed"
            ? "removed in AFTER"
            : visual === "added"
              ? "added in AFTER"
              : undefined;
      return { ...e, visual, label };
    });

  const usedNetworks = new Set(edges.filter((e) => e.kind === "membership").map((e) => e.target));
  const nodes: ViewNode[] = model.nodes
    .filter((n) => (n.kind === "network" ? usedNetworks.has(n.id) : nodeVisible(n, mode)))
    .map((n) => ({
      ...n,
      visual: nodeVisual(n, mode),
      risk: mode === "before" ? undefined : n.severity,
      danglingTarget: n.ghostAfter && !n.inAfter,
    }));
  return { nodes, edges };
}
