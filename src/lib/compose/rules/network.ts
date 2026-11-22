import { declaredLinks, effectiveNetworks, ev, formatList, networkKeysEvidence, rel, sharesNetwork } from "../graph";
import type { Evidence, Finding, NormalizedCompose, Relationship } from "../types";
import type { RuleContext } from "./types";

const REASON_BASE =
  "Docker Compose service-name DNS and container-to-container traffic only work between containers attached to a common network. " +
  "Published ports are for host access and do not substitute for a shared network.";

function pairEvidence(ctx: RuleContext, a: string, b: string): Evidence[] {
  return [
    ev("before", `services.${a}.networks`, networkKeysEvidence(ctx.before, a)),
    ev("before", `services.${b}.networks`, networkKeysEvidence(ctx.before, b)),
    ev("after", `services.${a}.networks`, networkKeysEvidence(ctx.after, a)),
    ev("after", `services.${b}.networks`, networkKeysEvidence(ctx.after, b)),
  ];
}

function linksBetween(c: NormalizedCompose, a: string, b: string) {
  return declaredLinks(c).filter((l) => (l.from === a && l.to === b) || (l.from === b && l.to === a));
}

const sharedKeysText = (c: NormalizedCompose, a: string, b: string): string => {
  const na = effectiveNetworks(c, a);
  const shared = [...effectiveNetworks(c, b)].filter((id) => na.has(id));
  return formatList(shared.map((id) => id.replace(/^(project|named|external|builtin):/, "")));
};

/** Services that lose every Docker network they previously shared with another service. */
export function networkLostRule(ctx: RuleContext): Finding[] {
  const { before, after } = ctx;
  const names = Object.keys(before.services)
    .filter((n) => n in after.services)
    .sort();

  const findings: Finding[] = [];
  const unrelatedByOwner = new Map<string, string[]>();

  for (let i = 0; i < names.length; i++) {
    for (let j = i + 1; j < names.length; j++) {
      const a = names[i]!;
      const b = names[j]!;
      if (!sharesNetwork(before, a, b) || sharesNetwork(after, a, b)) continue;

      const afterLinks = linksBetween(after, a, b);
      const beforeLinks = linksBetween(before, a, b);

      if (afterLinks.length === 0 && beforeLinks.length === 0) {
        const list = unrelatedByOwner.get(a) ?? [];
        list.push(b);
        unrelatedByOwner.set(a, list);
        continue;
      }

      const stillDeclared = afterLinks.length > 0;
      const links = stillDeclared ? afterLinks : beforeLinks;
      // Report on the dependent (the service that declares the relationship).
      const first = links[0]!;
      const owner = first.from;
      const other = first.to;
      const relationships: Relationship[] = links.map((l) =>
        rel(l.from, l.to, l.type, stillDeclared ? "broken" : "at-risk", stillDeclared ? "Still declared, but no shared network remains." : "Relationship was also removed in AFTER."),
      );
      relationships.push(
        rel(owner, other, "network", "broken", `Shared before: ${sharedKeysText(before, a, b)}. Shared after: (none).`),
      );

      findings.push({
        id: `network-lost:${owner}:${other}`,
        ruleId: "network-lost",
        severity: stillDeclared ? "high" : "medium",
        service: owner,
        title: `${owner} and ${other} no longer share a network`,
        confirmedChange: `In BEFORE, "${owner}" and "${other}" shared network(s): ${sharedKeysText(before, a, b)}. In AFTER they share none.`,
        possibleConsequence: stillDeclared
          ? `"${owner}" may be unable to reach "${other}" by service name or IP, so requests from "${owner}" to "${other}" could fail at runtime.`
          : `If any application code still addresses "${other}" from "${owner}", those calls could fail. The declared relationship was removed too, which suggests the change may be intentional.`,
        reason: `${REASON_BASE} ${stillDeclared ? `"${owner}" still declares ${first.type} on "${other}".` : `The ${first.type} relationship that existed in BEFORE is gone in AFTER.`}`,
        basis: "inferred",
        evidence: pairEvidence(ctx, a, b),
        relationships,
        confidence: {
          level: stillDeclared ? "high" : "medium",
          uncertainty: [
            "Whether application code actually connects between these services is not visible in the Compose file.",
            "Traffic through the host (published ports, host.docker.internal) or an external address is not affected by this change.",
            ...(before.services[a]?.profiles.length || before.services[b]?.profiles.length
              ? ["One of the services uses profiles and may not run in every deployment."]
              : []),
          ],
        },
      });
    }
  }

  for (const [owner, peers] of [...unrelatedByOwner.entries()].sort()) {
    findings.push({
      id: `network-lost:${owner}:*`,
      ruleId: "network-lost",
      severity: "info",
      service: owner,
      title: `${owner} is now isolated from ${peers.join(", ")}`,
      confirmedChange: `"${owner}" shared a network with ${formatList(peers)} in BEFORE and shares none with them in AFTER.`,
      possibleConsequence: "If these services communicate without a declared depends_on or links, that traffic could fail. Network segmentation like this is often intentional.",
      reason: `${REASON_BASE} No depends_on, links, or network_mode relationship connects these services in either file, so no communication is declared.`,
      basis: "inferred",
      evidence: [
        ev("before", `services.${owner}.networks`, networkKeysEvidence(before, owner)),
        ev("after", `services.${owner}.networks`, networkKeysEvidence(after, owner)),
        ...peers.flatMap((p) => [ev("after", `services.${p}.networks`, networkKeysEvidence(after, p))]),
      ],
      relationships: peers.map((p) => rel(owner, p, "network", "at-risk", "Network no longer shared; no declared relationship.")),
      confidence: {
        level: "low",
        uncertainty: ["No declared relationship exists, so there is no evidence these services talk to each other."],
      },
    });
  }
  return findings;
}

/** A service references a network that is not defined at top level (Compose rejects this). */
export function networkUndefinedRule(ctx: RuleContext): Finding[] {
  const { before, after } = ctx;
  const findings: Finding[] = [];
  for (const svc of Object.values(after.services)) {
    for (const key of svc.networks) {
      if (key === "default" || after.networks[key]?.declared) continue;
      const wasUndefined =
        before.services[svc.name]?.networks.includes(key) === true && !before.networks[key]?.declared;
      if (wasUndefined) continue;
      findings.push({
        id: `network-undefined:${svc.name}:${key}`,
        ruleId: "network-undefined",
        severity: "critical",
        service: svc.name,
        title: `${svc.name} uses undefined network "${key}"`,
        confirmedChange: `In AFTER, "${svc.name}" attaches to network "${key}", which is not declared under top-level \`networks\`.`,
        possibleConsequence: "Docker Compose is expected to refuse to start this project until the network is declared.",
        reason: "Compose validates that every network a service references is defined at top level (except the implicit `default`).",
        basis: "compose-validation",
        evidence: [
          ev("before", `services.${svc.name}.networks`, networkKeysEvidence(before, svc.name)),
          ev("after", `services.${svc.name}.networks`, networkKeysEvidence(after, svc.name)),
          ev("after", "networks", `[${Object.keys(after.networks).join(", ")}]`),
        ],
        relationships: [],
        confidence: { level: "high", uncertainty: ["Extra files merged with -f or `include` could define this network."] },
      });
    }
  }
  return findings;
}
