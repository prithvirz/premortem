import type { Finding } from "../compose/types";
import { SEVERITY_RANK } from "./graph";

export interface Headline {
  /** Short, service-named statement of the top risk, e.g. "api → redis: shared network lost". */
  text: string;
  /** How the claim is supported, worded so inferred effects are not presented as proven. */
  qualifier: string;
  finding: Finding;
  /** Other non-informational findings not covered by the headline. */
  more: number;
}

const QUALIFIER: Record<Finding["basis"], string> = {
  "compose-validation": "Compose is expected to reject the AFTER file",
  inferred: "Possible runtime impact, inferred from configuration",
  policy: "Required by your policy",
};

/**
 * Build the verdict headline from the most severe non-info finding. Finding ids are deterministic
 * (`rule:service:...`), which lets us name services without parsing prose.
 */
export function buildHeadline(findings: Finding[]): Headline | null {
  const ranked = findings.filter((f) => f.severity !== "info").sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]);
  const top = ranked[0];
  if (!top) return null;
  const parts = top.id.split(":");
  let text: string;
  let covered = [top];

  switch (top.ruleId) {
    case "network-lost":
      text = `${parts[1]} → ${parts[2]}: shared network lost`;
      break;
    case "dependency-dangling": {
      const target = parts[2]!;
      covered = ranked.filter((f) => f.ruleId === "dependency-dangling" && f.id.split(":")[2] === target);
      const from = [...new Set(covered.map((f) => f.service))].sort();
      text = `${from.join(", ")} → ${target}: target service missing`;
      break;
    }
    case "dependency-unreachable":
      text = `${parts[1]} → ${parts[2]}: no shared network`;
      break;
    case "network-undefined":
      text = `${top.service}: undefined network "${parts[2]}"`;
      break;
    case "env-required-removed":
      text = `${top.service}: required ${parts[2]} no longer declared`;
      break;
    case "port-removed":
      text = `${top.service}: host port ${parts[2]?.split("-")[0]} no longer published`;
      break;
    case "port-host-changed":
    case "port-target-changed":
    case "port-exposure-widened":
      text = `${top.service}: ${top.title.replace(new RegExp(`^${top.service}\\s+`), "")}`;
      break;
  }
  return { text, qualifier: QUALIFIER[top.basis], finding: top, more: ranked.length - covered.length };
}
