import type { Severity } from "../compose/types";
import type { EdgeVisual, NodeVisual } from "./view";
import type { ChangeKind, EdgeKind } from "./graph";

/** Palette. Charcoal base, violet and cyan for structure, orange and red only for risk. */
export const COLORS = {
  structure: "#6e6a86",
  violet: "#9b8cff",
  cyan: "#4cc9d4",
  amber: "#ff9a3c",
  red: "#ff4d5e",
  ghost: "#8b869c",
} as const;

export interface SeverityVisual {
  label: string;
  /** Shape glyph so severity is never conveyed by color alone. */
  glyph: string;
  color: string;
}

const SEV: Record<Severity, SeverityVisual> = {
  critical: { label: "Critical", glyph: "◆", color: COLORS.red },
  high: { label: "High", glyph: "▲", color: COLORS.amber },
  medium: { label: "Medium", glyph: "●", color: "#e8c25a" },
  low: { label: "Low", glyph: "■", color: COLORS.cyan },
  info: { label: "Info", glyph: "○", color: COLORS.ghost },
};

export const severityVisual = (s: Severity): SeverityVisual => SEV[s];

export interface EdgeSpec {
  stroke: string;
  /** SVG dash pattern; each state has a distinct pattern in addition to color. */
  dash?: string;
  width: number;
  animated: boolean;
  opacity: number;
  /** Draw with a deliberate gap at the midpoint: the relationship is cut in the configuration. */
  severed?: boolean;
  /** Draw the stroke in once: a relationship the preview reconnects. */
  restore?: boolean;
}

export function edgeSpec(visual: EdgeVisual, kind: EdgeKind): EdgeSpec {
  if (kind === "membership") {
    const base: EdgeSpec = { stroke: COLORS.violet, dash: "2 5", width: 1, animated: false, opacity: 0.35 };
    if (visual === "added") return { ...base, stroke: COLORS.cyan, opacity: 0.8 };
    if (visual === "removed") return { ...base, stroke: COLORS.ghost, dash: "1 6", opacity: 0.6 };
    return base;
  }
  switch (visual) {
    case "broken":
      return { stroke: COLORS.red, width: 2.5, animated: false, opacity: 1, severed: true };
    case "at-risk":
      return { stroke: COLORS.amber, dash: "4 4", width: 2, animated: true, opacity: 1 };
    case "restored":
      return { stroke: COLORS.cyan, width: 2.75, animated: false, opacity: 1, restore: true };
    case "isolated":
      return { stroke: COLORS.violet, dash: "1 5", width: 1.25, animated: false, opacity: 0.55 };
    case "added":
      return { stroke: COLORS.cyan, width: 2, animated: false, opacity: 1 };
    case "removed":
      return { stroke: COLORS.ghost, dash: "3 6", width: 1.5, animated: false, opacity: 0.7 };
    default:
      return { stroke: COLORS.structure, width: 1.5, animated: false, opacity: 0.9 };
  }
}

export interface NodeBadge {
  text: string;
  tone: "severity" | "add" | "remove" | "dangling" | "change" | "unknown";
  /** Set for severity badges so they use the same color as every other severity indicator. */
  color?: string;
}

const CHANGE_LABEL: Record<ChangeKind, string> = {
  networks: "Networks changed",
  ports: "Ports changed",
  dependencies: "Dependencies changed",
  environment: "Env keys changed",
  image: "Image changed",
  volumes: "Volumes changed",
};
export const changeLabel = (k: ChangeKind): string => CHANGE_LABEL[k];

/** Badges for a service node. Status first, then severity, then specific changes (max two plus a count). */
export function nodeBadges(
  visual: NodeVisual,
  risk: Severity | undefined,
  hasUnknowns: boolean,
  dangling: boolean,
  changeKinds: ChangeKind[] = [],
): NodeBadge[] {
  const out: NodeBadge[] = [];
  if (visual === "added") out.push({ text: "+ Added in AFTER", tone: "add" });
  if (visual === "removed") out.push(dangling ? { text: "Removed, still referenced", tone: "dangling" } : { text: "Ghost of BEFORE", tone: "remove" });
  if (visual === "missing") out.push({ text: "Not defined", tone: "dangling" });
  if (risk && risk !== "info") {
    const v = severityVisual(risk);
    out.push({ text: `${v.glyph} ${v.label}`, tone: "severity", color: v.color });
  }
  if (visual === "changed") {
    const shown = changeKinds.slice(0, 2).map((k): NodeBadge => ({ text: CHANGE_LABEL[k], tone: "change" }));
    out.push(...shown);
    if (changeKinds.length > 2) out.push({ text: `+${changeKinds.length - 2} more`, tone: "change" });
  }
  if (hasUnknowns) out.push({ text: "? Unresolved", tone: "unknown" });
  return out;
}
export const EDGE_KIND_LABEL: Record<EdgeKind, string> = {
  depends_on: "depends_on",
  links: "links",
  network_mode: "network_mode",
  membership: "network membership",
  "lost-network": "lost shared network",
};
