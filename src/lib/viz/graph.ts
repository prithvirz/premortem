import dagre from "@dagrejs/dagre";
import type { ComposeDiff, ServiceDiff } from "../compose/diff";
import { declaredLinks } from "../compose/graph";
import type { Diagnostic, Finding, NormalizedCompose, Relationship, Severity } from "../compose/types";

export type ViewMode = "before" | "after" | "diff";
export type EdgeKind = "depends_on" | "links" | "network_mode" | "membership" | "lost-network";
/** broken/at-risk come from declared relationships; isolated means no declared link exists (info only). */
export type RiskState = "broken" | "at-risk" | "isolated";
const RISK_RANK: Record<RiskState, number> = { broken: 3, "at-risk": 2, isolated: 1 };

export const SEVERITY_RANK: Record<Severity, number> = { critical: 4, high: 3, medium: 2, low: 1, info: 0 };

export interface GraphNode {
  id: string;
  kind: "service" | "network";
  label: string;
  position: { x: number; y: number };
  inBefore: boolean;
  inAfter: boolean;
  /** Referenced by a declared link but defined in neither/that version. */
  ghostBefore: boolean;
  ghostAfter: boolean;
  image?: string;
  ports: { before: string[]; after: string[] };
  /** Human-readable differences from the structural diff. */
  changes: string[];
  changed: boolean;
  /** Categories of change, for specific badges such as "Networks changed". */
  changeKinds: ChangeKind[];
  /** `network_mode` per version, when set (replaces network membership). */
  networkMode: { before?: string; after?: string };
  /** Highest severity among findings whose affected service is this node. */
  severity?: Severity;
  findingIds: string[];
  /** Findings where this node is the other end of an affected relationship. */
  involvedIds: string[];
  /** Compose features present that the analysis could not resolve. */
  unknowns: string[];
  external?: boolean;
  implicit?: boolean;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  kind: EdgeKind;
  presence: { before: boolean; after: boolean };
  risk?: RiskState;
  riskLabel?: string;
  findingIds: string[];
}

export interface GraphModel {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export type ChangeKind = "networks" | "ports" | "dependencies" | "environment" | "image" | "volumes";

const svcId = (n: string) => `svc:${n}`;
const netId = (identity: string) => `net:${identity}`;

const NODE_W = 220;
const NODE_H = 150;

function describeChanges(d: ServiceDiff | undefined): string[] {
  if (!d) return [];
  const out: string[] = [];
  const add = (label: string, items: string[]) => items.length > 0 && out.push(`${label}: ${items.join(", ")}`);
  if (d.image) out.push(`image: ${d.image.before ?? "(none)"} -> ${d.image.after ?? "(none)"}`);
  add("networks added", d.networksAdded);
  add("networks removed", d.networksRemoved);
  add("ports added", d.portsAdded);
  add("ports removed", d.portsRemoved);
  add("depends_on added", d.dependsOnAdded);
  add("depends_on removed", d.dependsOnRemoved);
  add("env keys added", d.envKeysAdded);
  add("env keys removed", d.envKeysRemoved);
  add("volumes added", d.volumesAdded);
  add("volumes removed", d.volumesRemoved);
  return out;
}

function changeKindsOf(d: ServiceDiff | undefined): ChangeKind[] {
  if (!d) return [];
  const out: ChangeKind[] = [];
  if (d.networksAdded.length + d.networksRemoved.length > 0) out.push("networks");
  if (d.portsAdded.length + d.portsRemoved.length > 0) out.push("ports");
  if (d.dependsOnAdded.length + d.dependsOnRemoved.length > 0) out.push("dependencies");
  if (d.envKeysAdded.length + d.envKeysRemoved.length > 0) out.push("environment");
  if (d.image) out.push("image");
  if (d.volumesAdded.length + d.volumesRemoved.length > 0) out.push("volumes");
  return out;
}

function riskLabelFor(rel: Relationship, ruleId: Finding["ruleId"]): string {
  if (rel.type === "network" || ruleId === "network-lost") return "no shared network";
  if (ruleId === "network-undefined") return "undefined network";
  if (rel.type === "container_port") return "container port changed";
  return "target service missing";
}

/** Build the unified (BEFORE + AFTER) graph with a single shared layout. Pure and deterministic. */
export function buildGraphModel(
  before: NormalizedCompose,
  after: NormalizedCompose,
  diff: ComposeDiff,
  findings: Finding[],
): GraphModel {
  const nodes = new Map<string, GraphNode>();
  const edges = new Map<string, GraphEdge>();

  const blank = (id: string, kind: GraphNode["kind"], label: string): GraphNode => ({
    id,
    kind,
    label,
    position: { x: 0, y: 0 },
    inBefore: false,
    inAfter: false,
    ghostBefore: false,
    ghostAfter: false,
    ports: { before: [], after: [] },
    changes: [],
    changed: false,
    changeKinds: [],
    networkMode: {},
    findingIds: [],
    involvedIds: [],
    unknowns: [],
  });

  const diffByName = new Map(diff.changedServices.map((d) => [d.name, d]));
  const portLabels = (c: NormalizedCompose, name: string) =>
    (c.services[name]?.ports ?? []).filter((p) => !p.unresolved && p.published !== undefined).map((p) => `${p.hostIp ? `${p.hostIp}:` : ""}${p.published}->${p.target}`);

  // Services.
  for (const side of ["before", "after"] as const) {
    const c = side === "before" ? before : after;
    for (const svc of Object.values(c.services)) {
      const n = nodes.get(svcId(svc.name)) ?? blank(svcId(svc.name), "service", svc.name);
      if (side === "before") n.inBefore = true;
      else n.inAfter = true;
      n.image = svc.image ?? (svc.build !== undefined ? `build: ${svc.build}` : n.image);
      n.ports[side] = portLabels(c, svc.name);
      if (svc.networkMode) n.networkMode[side] = svc.networkMode;
      nodes.set(n.id, n);
    }
  }
  for (const n of nodes.values()) {
    const d = diffByName.get(n.label);
    n.changes = describeChanges(d);
    n.changeKinds = changeKindsOf(d);
    if (n.inBefore && n.inAfter && n.networkMode.before !== n.networkMode.after) {
      n.changes.push(`network_mode: ${n.networkMode.before ?? "(unset)"} -> ${n.networkMode.after ?? "(unset)"}`);
      if (!n.changeKinds.includes("networks")) n.changeKinds.unshift("networks");
    }
    n.changed = n.changes.length > 0;
  }

  // Declared relationships (also creates ghost nodes for undefined targets).
  for (const side of ["before", "after"] as const) {
    const c = side === "before" ? before : after;
    for (const l of declaredLinks(c)) {
      if (!(l.from in c.services)) continue;
      const tid = svcId(l.to);
      let target = nodes.get(tid);
      if (!target) {
        target = blank(tid, "service", l.to);
        nodes.set(tid, target);
      }
      if (!(l.to in c.services)) {
        if (side === "before") target.ghostBefore = true;
        else target.ghostAfter = true;
      }
      const id = `e:${l.type}:${l.from}->${l.to}`;
      const e = edges.get(id) ?? { id, source: svcId(l.from), target: tid, kind: l.type, presence: { before: false, after: false }, findingIds: [] };
      e.presence[side] = true;
      edges.set(id, e);
    }
  }

  // Networks and membership edges (network_mode services have no direct membership).
  for (const side of ["before", "after"] as const) {
    const c = side === "before" ? before : after;
    for (const svc of Object.values(c.services)) {
      if (svc.networkMode) continue;
      for (const key of svc.networks) {
        const def = c.networks[key];
        const identity = def?.identity ?? `project:${key}`;
        const nid = netId(identity);
        const n = nodes.get(nid) ?? blank(nid, "network", key === "default" && !def?.declared ? "default (implicit)" : key);
        n.external = def?.external;
        n.implicit = key === "default" && !def?.declared;
        nodes.set(nid, n);
        const id = `e:membership:${svc.name}->${identity}`;
        const e = edges.get(id) ?? { id, source: svcId(svc.name), target: nid, kind: "membership" as const, presence: { before: false, after: false }, findingIds: [] };
        e.presence[side] = true;
        edges.set(id, e);
      }
    }
  }
  for (const n of nodes.values()) {
    if (n.kind !== "network") continue;
    n.inBefore = [...edges.values()].some((e) => e.target === n.id && e.presence.before);
    n.inAfter = [...edges.values()].some((e) => e.target === n.id && e.presence.after);
  }

  // Unresolved-feature warnings from the engine's diagnostics.
  const addUnknowns = (list: Diagnostic[]) => {
    for (const d of list) {
      const n = d.service ? nodes.get(svcId(d.service)) : undefined;
      if (n && !n.unknowns.includes(d.message)) n.unknowns.push(d.message);
    }
  };
  addUnknowns(before.diagnostics);
  addUnknowns(after.diagnostics);

  // Overlay findings.
  const findEdges = (a: string, b: string) =>
    [...edges.values()].filter(
      (e) => e.kind !== "membership" && e.kind !== "lost-network" && ((e.source === svcId(a) && e.target === svcId(b)) || (e.source === svcId(b) && e.target === svcId(a))),
    );
  const mark = (e: GraphEdge, state: RiskState, label: string, fid: string) => {
    if (!e.risk || RISK_RANK[state] > RISK_RANK[e.risk]) {
      e.risk = state;
      e.riskLabel = label;
    }
    if (!e.findingIds.includes(fid)) e.findingIds.push(fid);
  };

  for (const f of findings) {
    const own = nodes.get(svcId(f.service));
    if (own) {
      own.findingIds.push(f.id);
      if (!own.severity || SEVERITY_RANK[f.severity] > SEVERITY_RANK[own.severity]) own.severity = f.severity;
    }
    for (const r of f.relationships) {
      if (r.status !== "broken" && r.status !== "at-risk") continue;
      const state: RiskState = f.severity === "info" ? "isolated" : r.status;
      for (const end of [r.from, r.to]) {
        const n = nodes.get(svcId(end));
        if (n && end !== f.service && !n.involvedIds.includes(f.id)) n.involvedIds.push(f.id);
      }
      if (r.type === "network") {
        const existing = findEdges(r.from, r.to).filter((e) => e.presence.after);
        if (existing.length > 0) {
          for (const e of existing) mark(e, state, riskLabelFor(r, f.ruleId), f.id);
        } else {
          const [x, y] = [r.from, r.to].sort();
          const id = `e:lost:${x}~${y}`;
          const e = edges.get(id) ?? {
            id,
            source: svcId(r.from),
            target: svcId(r.to),
            kind: "lost-network" as const,
            presence: { before: false, after: true },
            findingIds: [],
          };
          mark(e, state, riskLabelFor(r, f.ruleId), f.id);
          edges.set(id, e);
        }
      } else {
        const candidates = [...edges.values()].filter(
          (e) =>
            e.source === svcId(r.from) &&
            e.target === svcId(r.to) &&
            (r.type === "container_port" ? e.kind === "depends_on" || e.kind === "links" : e.kind === r.type),
        );
        for (const e of candidates) mark(e, state, riskLabelFor(r, f.ruleId), f.id);
      }
    }
  }

  layout(nodes, edges);
  return { nodes: [...nodes.values()], edges: [...edges.values()] };
}

function layout(nodes: Map<string, GraphNode>, edges: Map<string, GraphEdge>): void {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: "LR", ranksep: 230, nodesep: 56, marginx: 20, marginy: 20 });
  g.setDefaultEdgeLabel(() => ({}));
  const services = [...nodes.values()].filter((n) => n.kind === "service").sort((a, b) => a.label.localeCompare(b.label));
  for (const n of services) g.setNode(n.id, { width: NODE_W, height: NODE_H });
  for (const e of [...edges.values()].sort((a, b) => a.id.localeCompare(b.id))) {
    if (e.kind === "depends_on" || e.kind === "links" || e.kind === "network_mode") g.setEdge(e.source, e.target);
  }
  dagre.layout(g);
  let maxY = 0;
  for (const n of services) {
    const p = g.node(n.id);
    n.position = { x: Math.round(p.x - NODE_W / 2), y: Math.round(p.y - NODE_H / 2) };
    maxY = Math.max(maxY, n.position.y + NODE_H);
  }

  // Networks sit in a band below the services, under the mean x of their members.
  const nets = [...nodes.values()].filter((n) => n.kind === "network");
  const wanted = nets.map((n) => {
    const xs = [...edges.values()].filter((e) => e.target === n.id).map((e) => nodes.get(e.source)!.position.x + NODE_W / 2);
    return { n, x: xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0 };
  });
  wanted.sort((a, b) => a.x - b.x || a.n.label.localeCompare(b.n.label));
  const NET_W = 150;
  let cursor = -Infinity;
  for (const w of wanted) {
    const x = Math.max(w.x - NET_W / 2, cursor);
    w.n.position = { x: Math.round(x), y: maxY + 120 };
    cursor = x + NET_W + 30;
  }
}
