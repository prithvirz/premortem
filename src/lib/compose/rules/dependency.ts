import { declaredLinks, ev, rel } from "../graph";
import type { Finding, NormalizedCompose } from "../types";
import type { RuleContext } from "./types";

function renameCandidates(ctx: RuleContext, removed: string): string[] {
  const old = ctx.before.services[removed];
  if (!old) return [];
  return Object.values(ctx.after.services)
    .filter((s) => !(s.name in ctx.before.services))
    .filter((s) => (old.image !== undefined && s.image === old.image) || (old.build !== undefined && s.build === old.build))
    .map((s) => s.name)
    .sort();
}

const pathFor = (type: "depends_on" | "links" | "network_mode", svc: string): string =>
  type === "network_mode" ? `services.${svc}.network_mode` : `services.${svc}.${type}`;

function describeDeclared(c: NormalizedCompose, svc: string, type: "depends_on" | "links" | "network_mode"): string {
  const s = c.services[svc];
  if (!s) return "(service absent)";
  if (type === "depends_on") return `[${s.dependsOn.map((d) => d.service).join(", ")}]`;
  if (type === "links") return `[${s.links.join(", ")}]`;
  return s.networkMode ?? "(unset)";
}

/** Dependencies, links, or network_mode targets pointing at services that no longer exist. */
export function dependencyDanglingRule(ctx: RuleContext): Finding[] {
  const { before, after } = ctx;
  const seen = new Set<string>();
  const findings: Finding[] = [];
  const beforeLinks = declaredLinks(before);

  for (const link of declaredLinks(after)) {
    if (link.to in after.services) continue;
    const key = `${link.from}|${link.to}|${link.type}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const existedBefore = link.to in before.services;
    const sameDanglingBefore =
      !existedBefore && beforeLinks.some((b) => b.from === link.from && b.to === link.to && b.type === link.type);
    if (sameDanglingBefore) continue; // Not introduced by this change.

    const candidates = existedBefore ? renameCandidates(ctx, link.to) : [];
    const optional =
      link.type === "depends_on" && after.services[link.from]?.dependsOn.find((d) => d.service === link.to)?.required === false;

    const subject = existedBefore
      ? `"${link.to}" was defined in BEFORE and is not defined in AFTER`
      : `"${link.to}" is not defined in either file`;

    const uncertainty = ["Extra files merged with -f or `include` could define this service."];
    if (candidates.length > 0) {
      uncertainty.push(
        `Possible rename: ${candidates.map((c) => `"${c}"`).join(", ")} (matched by identical image or build context). This is a heuristic.`,
      );
    }
    if (optional) {
      uncertainty.push("The dependency is marked `required: false`; Compose behavior for undefined services in that case was not verified here.");
    }

    findings.push({
      id: `dependency-dangling:${link.from}:${link.to}:${link.type}`,
      ruleId: "dependency-dangling",
      severity: optional ? "high" : "critical",
      service: link.from,
      title: `${link.from} ${link.type === "network_mode" ? "shares the network of" : link.type === "links" ? "links to" : "depends on"} missing service "${link.to}"`,
      confirmedChange: `In AFTER, "${link.from}" references "${link.to}" via ${link.type}, but ${subject}.`,
      possibleConsequence:
        link.type === "network_mode"
          ? "Docker Compose is expected to reject the project, so none of the stack would start."
          : "Docker Compose is expected to reject the project with an undefined-service error, so the stack would not start.",
      reason: `Compose requires every ${link.type} target to be a service in the project.${candidates.length > 0 ? " A service with the same image was added, which suggests a rename." : ""}`,
      basis: "compose-validation",
      evidence: [
        ev("before", pathFor(link.type, link.from), describeDeclared(before, link.from, link.type)),
        ev("after", pathFor(link.type, link.from), describeDeclared(after, link.from, link.type)),
        ev("before", "services", `[${Object.keys(before.services).join(", ")}]`),
        ev("after", "services", `[${Object.keys(after.services).join(", ")}]`),
      ],
      relationships: [rel(link.from, link.to, link.type, "broken", "Target service is not defined in AFTER.")],
      confidence: { level: optional ? "medium" : "high", uncertainty },
    });
  }
  return findings;
}
