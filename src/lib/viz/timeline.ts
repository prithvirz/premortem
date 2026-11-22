import type { ComposeDiff } from "../compose/diff";
import type { Finding, Severity } from "../compose/types";
import type { GraphModel, ViewMode } from "./graph";

export interface TimelineStep {
  id: string;
  phase: "change" | "consequence";
  title: string;
  detail: string;
  /** Lines taken directly from the structural diff or from finding evidence. */
  evidence: string[];
  nodeIds: string[];
  edgeIds: string[];
  /** Set for consequence steps. */
  findingId?: string;
  /** Findings that concern the services touched by a change step. */
  relatedFindingIds: string[];
  severity?: Severity;
  suggestedMode: ViewMode;
}

const svc = (n: string) => `svc:${n}`;

/**
 * Investigation order: first what changed in the files (confirmed), then what each change
 * might break (findings, most severe first). Every step is derived from engine output.
 */
export function buildTimeline(model: GraphModel, diff: ComposeDiff, findings: Finding[]): TimelineStep[] {
  const steps: TimelineStep[] = [];
  const related = (...services: string[]) => findings.filter((f) => services.includes(f.service)).map((f) => f.id);

  for (const name of diff.servicesRemoved) {
    steps.push({
      id: `change:removed:${name}`,
      phase: "change",
      title: `Service "${name}" removed`,
      detail: "Defined in BEFORE, absent from AFTER.",
      evidence: [`services.${name}: present in BEFORE, absent in AFTER`],
      nodeIds: [svc(name)],
      edgeIds: [],
      relatedFindingIds: findings.filter((f) => f.relationships.some((r) => r.to === name)).map((f) => f.id),
      suggestedMode: "diff",
    });
  }
  for (const name of diff.servicesAdded) {
    steps.push({
      id: `change:added:${name}`,
      phase: "change",
      title: `Service "${name}" added`,
      detail: "Absent from BEFORE, defined in AFTER.",
      evidence: [`services.${name}: absent in BEFORE, present in AFTER`],
      nodeIds: [svc(name)],
      edgeIds: [],
      relatedFindingIds: related(name),
      suggestedMode: "diff",
    });
  }
  if (diff.networksAdded.length + diff.networksRemoved.length > 0) {
    steps.push({
      id: "change:networks",
      phase: "change",
      title: "Network topology changed",
      detail: "Networks were added or removed at the top level.",
      evidence: [
        ...diff.networksAdded.map((n) => `networks.${n}: added`),
        ...diff.networksRemoved.map((n) => `networks.${n}: removed`),
      ],
      nodeIds: model.nodes.filter((n) => n.kind === "network" && (n.inBefore !== n.inAfter)).map((n) => n.id),
      edgeIds: [],
      relatedFindingIds: findings.filter((f) => f.ruleId === "network-lost" || f.ruleId === "network-undefined").map((f) => f.id),
      suggestedMode: "diff",
    });
  }
  for (const d of diff.changedServices) {
    const lines = model.nodes.find((n) => n.id === svc(d.name))?.changes ?? [];
    if (lines.length === 0) continue;
    const kinds = [
      d.networksAdded.length + d.networksRemoved.length > 0 && "networks",
      d.portsAdded.length + d.portsRemoved.length > 0 && "ports",
      d.dependsOnAdded.length + d.dependsOnRemoved.length > 0 && "dependencies",
      d.envKeysAdded.length + d.envKeysRemoved.length > 0 && "environment keys",
      d.image && "image",
      d.volumesAdded.length + d.volumesRemoved.length > 0 && "volumes",
    ].filter(Boolean) as string[];
    steps.push({
      id: `change:service:${d.name}`,
      phase: "change",
      title: `"${d.name}" changed: ${kinds.join(", ")}`,
      detail: "Differences found between the BEFORE and AFTER definitions.",
      evidence: lines,
      nodeIds: [svc(d.name)],
      edgeIds: model.edges.filter((e) => e.source === svc(d.name) && e.kind === "membership" && e.presence.before !== e.presence.after).map((e) => e.id),
      relatedFindingIds: related(d.name),
      suggestedMode: "diff",
    });
  }

  for (const f of findings) {
    const nodeIds = new Set<string>([svc(f.service)]);
    for (const r of f.relationships) {
      if (r.status === "broken" || r.status === "at-risk") {
        nodeIds.add(svc(r.from));
        nodeIds.add(svc(r.to));
      }
    }
    steps.push({
      id: `finding:${f.id}`,
      phase: "consequence",
      title: f.title,
      detail: f.possibleConsequence,
      evidence: f.evidence.map((e) => `${e.side} ${e.path}: ${e.value}`),
      nodeIds: [...nodeIds],
      edgeIds: model.edges.filter((e) => e.findingIds.includes(f.id)).map((e) => e.id),
      findingId: f.id,
      relatedFindingIds: [f.id],
      severity: f.severity,
      suggestedMode: "after",
    });
  }
  return steps;
}
