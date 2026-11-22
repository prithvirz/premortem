import type { Finding } from "../compose/types";
import type { GraphModel } from "./graph";
import type { TimelineStep } from "./timeline";

export type Selection = { kind: "finding" | "node" | "edge"; id: string } | null;

/** "lost": the services shared this network in BEFORE and no longer do. "related": context for the selection. */
export type NetworkEmphasis = "lost" | "related";

export interface Highlight {
  /** Service node ids and edge ids that stay at full strength; everything else is dimmed. */
  ids: Set<string>;
  /** Networks to emphasize (never dimmed) on tags and in the network strip. */
  networks: Map<string, NetworkEmphasis>;
}

const NETWORK_RULES = new Set<Finding["ruleId"]>(["network-lost", "network-undefined", "dependency-unreachable"]);

function membershipsOf(model: GraphModel, nodeId: string, side?: "before" | "after"): string[] {
  return model.edges
    .filter((e) => e.kind === "membership" && e.source === nodeId && (!side || e.presence[side]))
    .map((e) => e.target);
}

function addFinding(model: GraphModel, f: Finding, h: Highlight): void {
  const services = new Set<string>([`svc:${f.service}`]);
  for (const r of f.relationships) {
    if (r.status === "broken" || r.status === "at-risk") {
      services.add(`svc:${r.from}`);
      services.add(`svc:${r.to}`);
    }
  }
  services.forEach((id) => h.ids.add(id));
  for (const e of model.edges) if (e.findingIds.includes(f.id)) h.ids.add(e.id);

  if (!NETWORK_RULES.has(f.ruleId)) return;
  const list = [...services];
  // Every network the involved services touched in either version explains the finding.
  for (const id of list) for (const net of membershipsOf(model, id)) if (!h.networks.has(net)) h.networks.set(net, "related");
  // Networks that were shared between a pair in BEFORE but are not shared in AFTER are the cause.
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i]!;
      const b = list[j]!;
      const bBefore = new Set(membershipsOf(model, b, "before"));
      const bAfter = new Set(membershipsOf(model, b, "after"));
      const aAfter = new Set(membershipsOf(model, a, "after"));
      for (const net of membershipsOf(model, a, "before")) {
        if (bBefore.has(net) && !(aAfter.has(net) && bAfter.has(net))) h.networks.set(net, "lost");
      }
    }
  }
}

/** Decide what stays lit for the current selection or timeline step. Pure; null means "show everything". */
export function highlightFor(model: GraphModel, findings: Finding[], selection: Selection, step: TimelineStep | null): Highlight | null {
  const h: Highlight = { ids: new Set(), networks: new Map() };
  const byId = (id: string) => findings.find((f) => f.id === id);

  if (step) {
    for (const id of step.nodeIds) {
      if (id.startsWith("net:")) h.networks.set(id, "related");
      else h.ids.add(id);
    }
    step.edgeIds.forEach((id) => h.ids.add(id));
    const f = step.findingId ? byId(step.findingId) : undefined;
    if (f) addFinding(model, f, h);
    else if (step.nodeIds.length === 1 && step.nodeIds[0]!.startsWith("svc:")) {
      for (const net of membershipsOf(model, step.nodeIds[0]!)) h.networks.set(net, "related");
    }
  } else if (selection?.kind === "finding") {
    const f = byId(selection.id);
    if (f) addFinding(model, f, h);
  } else if (selection?.kind === "node") {
    const id = selection.id;
    if (id.startsWith("net:")) {
      h.networks.set(id, "related");
      for (const e of model.edges) if (e.kind === "membership" && e.target === id) h.ids.add(e.source);
    } else {
      h.ids.add(id);
      for (const e of model.edges) {
        if (e.kind === "membership") continue;
        if (e.source === id || e.target === id) [e.id, e.source, e.target].forEach((x) => h.ids.add(x));
      }
      for (const net of membershipsOf(model, id)) h.networks.set(net, "related");
    }
  } else if (selection?.kind === "edge") {
    const e = model.edges.find((x) => x.id === selection.id);
    if (e) {
      [e.id, e.source, e.target].forEach((x) => h.ids.add(x));
      for (const fid of e.findingIds) {
        const f = byId(fid);
        if (f) addFinding(model, f, h);
      }
    }
  }
  return h.ids.size || h.networks.size ? h : null;
}
