import { declaredLinks, ev, networkKeysEvidence, reachability, rel, sharesNetwork } from "../graph";
import type { Finding, NormalizedCompose } from "../types";
import type { RuleContext } from "./types";

const STARTUP_ONLY =
  "depends_on controls start order (and health conditions); it does not connect containers. Service-to-service traffic needs a shared Compose network.";

function hasUndeclaredNetwork(c: NormalizedCompose, svc: string): boolean {
  const s = c.services[svc];
  return !!s && s.networks.some((k) => k !== "default" && !c.networks[k]?.declared);
}

/**
 * Declared relationships in AFTER whose two services share no Compose network.
 *
 * Scope is deliberately narrow so it does not duplicate other rules:
 * - Pairs that shared a network in BEFORE are left to `network-lost`.
 * - Missing targets are left to `dependency-dangling`; undeclared networks to `network-undefined`.
 * - Relationships that were already disconnected in BEFORE are reported as info ("unchanged").
 * - network_mode host/none/bridge/container:* yields a low-confidence "not analyzed" note, never a failure.
 */
export function dependencyUnreachableRule(ctx: RuleContext): Finding[] {
  const { before, after } = ctx;
  const findings: Finding[] = [];
  const seen = new Set<string>();
  const beforeLinks = declaredLinks(before);

  for (const link of declaredLinks(after)) {
    if (link.type === "network_mode") continue; // shares the namespace by definition
    const { from, to, type } = link;
    if (!(from in after.services) || !(to in after.services)) continue;
    const key = `${from}|${to}|${type}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (hasUndeclaredNetwork(after, from) || hasUndeclaredNetwork(after, to)) continue;

    const r = reachability(after, from, to);
    if (r === "shared") continue;

    const bothBefore = from in before.services && to in before.services;
    if (bothBefore && sharesNetwork(before, from, to)) continue; // network-lost reports this pair

    const declaredBefore = beforeLinks.some((b) => b.from === from && b.to === to && b.type === type);
    const preexisting = bothBefore && declaredBefore && reachability(before, from, to) === r;
    const targetIsNew = !(to in before.services);
    const evidence = [
      ev("after", `services.${from}.networks`, networkKeysEvidence(after, from)),
      ev("after", `services.${to}.networks`, networkKeysEvidence(after, to)),
      ev("after", `services.${from}.${type}`, `[${(type === "depends_on" ? after.services[from]!.dependsOn.map((d) => d.service) : after.services[from]!.links).join(", ")}]`),
      ...(bothBefore ? [ev("before", `services.${from}.networks`, networkKeysEvidence(before, from)), ev("before", `services.${to}.networks`, networkKeysEvidence(before, to))] : []),
    ];
    const id = `dependency-unreachable:${from}:${to}:${type}`;

    if (r === "unknown") {
      if (preexisting) continue;
      findings.push({
        id,
        ruleId: "dependency-unreachable",
        severity: "info",
        service: from,
        title: `${from} → ${to}: connectivity not analyzed (network_mode)`,
        confirmedChange: `In AFTER, "${from}" declares ${type} on "${to}", and at least one of them uses a network_mode other than service:<name>.`,
        possibleConsequence: `Whether "${from}" can reach "${to}" depends on the host's networking, which PreMortem cannot see.`,
        reason: `network_mode host, none, bridge, and container:<id> replace Compose networks, so shared-network analysis does not apply. ${STARTUP_ONLY}`,
        basis: "inferred",
        evidence,
        relationships: [rel(from, to, type, "unaffected", "Not analyzed.")],
        confidence: { level: "low", uncertainty: ["Host networking, published ports, and firewall rules are outside the Compose file."] },
      });
      continue;
    }

    if (preexisting) {
      findings.push({
        id,
        ruleId: "dependency-unreachable",
        severity: "info",
        service: from,
        title: `${from} → ${to}: no shared network (unchanged from BEFORE)`,
        confirmedChange: `"${from}" declares ${type} on "${to}" in both versions, and they share no network in either.`,
        possibleConsequence: `This was already the case before the change. If "${from}" talks to "${to}" directly, it may already be relying on something outside this file.`,
        reason: `Not introduced by this change. ${STARTUP_ONLY}`,
        basis: "inferred",
        evidence,
        relationships: [rel(from, to, type, "at-risk", "Pre-existing: no shared network in BEFORE or AFTER.")],
        confidence: { level: "low", uncertainty: ["The relationship may exist only to order startup.", "Traffic could go through published ports or an external address."] },
      });
      continue;
    }

    const why = !declaredBefore
      ? targetIsNew
        ? `"${to}" is new in AFTER and "${from}" now references it`
        : `the ${type} relationship is new in AFTER`
      : `"${from}" or "${to}" is new in AFTER`;
    const isLink = type === "links";
    findings.push({
      id,
      ruleId: "dependency-unreachable",
      severity: isLink ? "high" : "medium",
      service: from,
      title: `${from} → ${to}: no shared network`,
      confirmedChange: `In AFTER, "${from}" declares ${type} on "${to}", but they share no Compose network (${why}).`,
      possibleConsequence: `"${from}" may be unable to reach "${to}" by service name. Startup order would still be enforced, but requests between them could fail at runtime.`,
      reason: `${STARTUP_ONLY} ${isLink ? "links also implies the services expect to talk to each other." : ""}`.trim(),
      basis: "inferred",
      evidence,
      relationships: [rel(from, to, type, "at-risk", "Declared, but no shared network.")],
      confidence: {
        level: isLink ? "high" : "medium",
        uncertainty: [
          "The dependency may exist only to order startup; whether the services communicate is not visible in the file.",
          "Traffic through published ports, host networking, or an external address is not analyzed.",
          ...(after.services[from]!.profiles.length || after.services[to]!.profiles.length ? ["One of the services uses profiles and may not run in every deployment."] : []),
        ],
      },
    });
  }
  return findings;
}
