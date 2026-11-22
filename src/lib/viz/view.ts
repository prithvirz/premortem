import type { Severity } from "../compose/types";
import type { GraphEdge, GraphModel, GraphNode, ViewMode } from "./graph";

export type NodeVisual = "steady" | "changed" | "added" | "removed" | "missing";
export type EdgeVisual = "steady" | "added" | "removed" | "broken" | "at-risk" | "isolated";
export type TagState = "kept" | "added" | "removed";

/** A network a service is attached to, shown as a tag on the service instead of a membership curve. */
export interface NetworkTag {
  /** Network node id (`net:<identity>`). */
  id: string;
  label: string;
  state: TagState;
  external?: boolean;
  implicit?: boolean;
}

export interface ViewNode extends GraphNode {
  visual: NodeVisual;
  /** Severity badge, shown only for the AFTER-side views. */
  risk?: Severity;
  /** Removed in AFTER but still referenced by AFTER. */
  danglingTarget: boolean;
  /** Network tags for this view (diff view shows added/removed states). */
  networks: NetworkTag[];
  /** e.g. "network_mode: host" when the service uses network_mode in this view. */
  networkModeLabel?: string;
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

function tagsFor(model: GraphModel, nodeById: Map<string, GraphNode>, n: GraphNode, mode: ViewMode): NetworkTag[] {
  const tags: NetworkTag[] = [];
  for (const e of model.edges) {
    if (e.kind !== "membership" || e.source !== n.id) continue;
    const { before, after } = e.presence;
    let state: TagState | null = null;
    if (mode === "before") state = before ? "kept" : null;
    else if (mode === "after") state = after ? (before ? "kept" : "added") : null;
    else state = before && after ? "kept" : after ? "added" : "removed";
    if (!state) continue;
    // A removed (or newly added) service's memberships are its state, not a membership change.
    if (mode !== "before" && (!n.inAfter || !n.inBefore)) state = "kept";
    const net = nodeById.get(e.target);
    tags.push({ id: e.target, label: net?.implicit ? "default" : (net?.label ?? e.target), state, external: net?.external, implicit: net?.implicit });
  }
  const order: Record<TagState, number> = { kept: 0, added: 1, removed: 2 };
  return tags.sort((a, b) => order[a.state] - order[b.state] || a.label.localeCompare(b.label));
}

function networkModeLabel(n: GraphNode, mode: ViewMode): string | undefined {
  const m = mode === "before" ? n.networkMode.before : n.networkMode.after ?? (mode === "diff" && !n.inAfter ? n.networkMode.before : undefined);
  if (!m) return undefined;
  return m.startsWith("service:") ? `shares network of ${m.slice(8)}` : `network_mode: ${m}`;
}

/** Project the unified model onto one view. Node positions never change between views. */
export function viewGraph(model: GraphModel, mode: ViewMode): ViewGraph {
  const nodeById = new Map(model.nodes.map((n) => [n.id, n]));
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
      networks: n.kind === "service" ? tagsFor(model, nodeById, n, mode) : [],
      networkModeLabel: n.kind === "service" ? networkModeLabel(n, mode) : undefined,
    }));
  return { nodes, edges };
}
