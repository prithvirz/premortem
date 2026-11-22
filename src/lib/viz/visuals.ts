import type { Severity } from "../compose/types";
import type { EdgeVisual, NodeVisual } from "./view";
import type { EdgeKind } from "./graph";

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
      return { stroke: COLORS.red, dash: "10 6", width: 2.5, animated: false, opacity: 1 };
    case "at-risk":
      return { stroke: COLORS.amber, dash: "4 4", width: 2, animated: true, opacity: 1 };
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
  tone: "risk" | "add" | "remove" | "neutral" | "unknown";
}

export function nodeBadges(visual: NodeVisual, risk: Severity | undefined, hasUnknowns: boolean, dangling: boolean): NodeBadge[] {
  const out: NodeBadge[] = [];
  if (visual === "added") out.push({ text: "Added", tone: "add" });
  if (visual === "removed") out.push({ text: dangling ? "Removed, still referenced" : "Removed", tone: dangling ? "risk" : "remove" });
  if (visual === "missing") out.push({ text: "Not defined", tone: "risk" });
  if (visual === "changed") out.push({ text: "Changed", tone: "neutral" });
  if (risk && risk !== "info") out.push({ text: `${severityVisual(risk).glyph} ${severityVisual(risk).label}`, tone: "risk" });
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
