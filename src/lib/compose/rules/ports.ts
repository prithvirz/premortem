import { declaredLinks, ev, rel, sharesNetwork } from "../graph";
import { describeBinding } from "../ports";
import type { Finding, PortBinding, Relationship, Severity } from "../types";
import type { RuleContext } from "./types";

const isLoopback = (ip: string | undefined): boolean => ip === "127.0.0.1" || ip === "::1" || ip === "localhost";
const isAllInterfaces = (ip: string | undefined): boolean => ip === undefined || ip === "" || ip === "0.0.0.0" || ip === "::";

type Outcome =
  | { kind: "removed"; before: PortBinding }
  | { kind: "host-changed"; before: PortBinding; after: PortBinding }
  | { kind: "target-changed"; before: PortBinding; after: PortBinding }
  | { kind: "exposure-widened"; before: PortBinding; after: PortBinding };

function matchBindings(before: PortBinding[], after: PortBinding[]): Outcome[] {
  const b = before.filter((p) => !p.unresolved);
  const a = after.filter((p) => !p.unresolved);
  const used = new Set<number>();
  const done = new Set<number>();
  const outcomes: Outcome[] = [];

  const take = (pred: (x: PortBinding, y: PortBinding) => boolean, onMatch: (x: PortBinding, y: PortBinding) => void) => {
    b.forEach((x, i) => {
      if (done.has(i)) return;
      const j = a.findIndex((y, k) => !used.has(k) && pred(x, y));
      if (j === -1) return;
      used.add(j);
      done.add(i);
      onMatch(x, a[j]!);
    });
  };

  // 1. Same host port, protocol, and container port.
  take(
    (x, y) => x.published === y.published && x.protocol === y.protocol && x.target === y.target,
    (x, y) => {
      if (isLoopback(x.hostIp) && isAllInterfaces(y.hostIp)) outcomes.push({ kind: "exposure-widened", before: x, after: y });
    },
  );
  // 2. Same host port and protocol, different container port.
  take(
    (x, y) => x.published !== undefined && x.published === y.published && x.protocol === y.protocol,
    (x, y) => outcomes.push({ kind: "target-changed", before: x, after: y }),
  );
  // 3. Same container port and protocol, different host port.
  take(
    (x, y) => x.target === y.target && x.protocol === y.protocol,
    (x, y) => {
      if (x.published !== undefined && x.published !== y.published) outcomes.push({ kind: "host-changed", before: x, after: y });
    },
  );
  // 4. Whatever is left with a fixed host port was removed.
  b.forEach((x, i) => {
    if (!done.has(i) && x.published !== undefined) outcomes.push({ kind: "removed", before: x });
  });
  return outcomes;
}

export function portsRule(ctx: RuleContext): Finding[] {
  const { before, after } = ctx;
  const findings: Finding[] = [];

  for (const name of Object.keys(before.services).sort()) {
    const b = before.services[name];
    const a = after.services[name];
    if (!b || !a) continue;

    const dependents = declaredLinks(after)
      .filter((l) => l.to === name && l.from in after.services)
      .map((l) => l.from);
    const uniqueDependents = [...new Set(dependents)].sort();

    const beforePorts = `[${b.ports.map(describeBinding).join("; ")}]`;
    const afterPorts = `[${a.ports.map(describeBinding).join("; ")}]`;
    const baseEvidence = [ev("before", `services.${name}.ports`, beforePorts), ev("after", `services.${name}.ports`, afterPorts)];
    const hasUnresolved = [...b.ports, ...a.ports].some((p) => p.unresolved);
    const unresolvedNote = hasUnresolved ? ["Some port entries on this service use interpolation or an unsupported form and were not compared."] : [];

    for (const o of matchBindings(b.ports, a.ports)) {
      const key = `${o.before.published ?? "eph"}-${o.before.protocol}-${o.before.target}`;
      const movedTo =
        o.kind === "removed"
          ? Object.values(after.services).find(
              (s) => s.name !== name && s.ports.some((p) => !p.unresolved && p.published === o.before.published && p.protocol === o.before.protocol),
            )
          : undefined;

      if (o.kind === "removed") {
        const relationships: Relationship[] = uniqueDependents.map((d) =>
          rel(d, name, "published_port", "unaffected", `Service-to-service traffic uses container port ${o.before.target}, not host port ${o.before.published}.`),
        );
        findings.push({
          id: `port-removed:${name}:${key}`,
          ruleId: "port-removed",
          severity: movedTo ? "low" : "medium",
          service: name,
          title: `${name} no longer publishes host port ${o.before.published}/${o.before.protocol}`,
          confirmedChange: `BEFORE published ${describeBinding(o.before)}. AFTER has no binding for host port ${o.before.published}/${o.before.protocol} on "${name}".`,
          possibleConsequence: movedTo
            ? `Host port ${o.before.published} is now published by "${movedTo.name}". Clients that expected "${name}" there could reach a different service.`
            : `Clients outside the Docker network (browsers, host tools, other machines) that connect to host port ${o.before.published} could be refused.`,
          reason:
            "A published port exposes a container port on the Docker host. Other services on a shared network connect to the container port directly, so removing a published port does not affect them.",
          basis: "inferred",
          evidence: baseEvidence,
          relationships,
          confidence: {
            level: "medium",
            uncertainty: [
              "Who connects through this host port is not visible in the Compose file (it may have been unused or moved behind a proxy).",
              ...(movedTo ? [`The port now appears on "${movedTo.name}".`] : []),
              ...unresolvedNote,
            ],
          },
        });
      } else if (o.kind === "host-changed") {
        findings.push({
          id: `port-host-changed:${name}:${key}`,
          ruleId: "port-host-changed",
          severity: "medium",
          service: name,
          title: `${name} host port changed ${o.before.published} -> ${o.after.published ?? "<ephemeral>"}`,
          confirmedChange: `Container port ${o.before.target}/${o.before.protocol} was published on host port ${o.before.published}; AFTER publishes it on ${o.after.published ?? "an ephemeral port"}.`,
          possibleConsequence: `Clients using host port ${o.before.published} could fail to connect until updated.`,
          reason: "Only the host-side port changed. Container-to-container traffic uses the unchanged container port and is not affected.",
          basis: "inferred",
          evidence: baseEvidence,
          relationships: uniqueDependents.map((d) => rel(d, name, "published_port", "unaffected", "Uses the container port.")),
          confidence: { level: "medium", uncertainty: ["Clients of the old host port are not visible here.", ...unresolvedNote] },
        });
      } else if (o.kind === "target-changed") {
        const severity: Severity = uniqueDependents.length > 0 ? "high" : "medium";
        findings.push({
          id: `port-target-changed:${name}:${key}`,
          ruleId: "port-target-changed",
          severity,
          service: name,
          title: `${name} container port changed ${o.before.target} -> ${o.after.target}`,
          confirmedChange: `Host port ${o.before.published}/${o.before.protocol} mapped to container port ${o.before.target}; AFTER maps it to ${o.after.target}.`,
          possibleConsequence: `If the process in "${name}" still listens on ${o.before.target}, traffic through host port ${o.before.published} could fail. Services that connect to "${name}:${o.before.target}" over a shared network could fail if they are not updated.`,
          reason:
            "The container port is what other services on a shared network connect to. A changed mapping suggests the application's listening port changed, which dependents may not know about.",
          basis: "inferred",
          evidence: baseEvidence,
          relationships: uniqueDependents.map((d) =>
            rel(d, name, "container_port", sharesNetwork(after, d, name) ? "at-risk" : "unaffected", `Connects to container port ${o.before.target} if it uses the old value.`),
          ),
          confidence: {
            level: "medium",
            uncertainty: [
              "The port the application actually listens on is set in the image or command, which is not analyzed.",
              "Dependents' connection settings (environment values) are intentionally not read.",
              ...unresolvedNote,
            ],
          },
        });
      } else {
        findings.push({
          id: `port-exposure-widened:${name}:${key}`,
          ruleId: "port-exposure-widened",
          severity: "medium",
          service: name,
          title: `${name} port ${o.before.published} is no longer bound to loopback only`,
          confirmedChange: `BEFORE bound ${describeBinding(o.before)}. AFTER binds ${describeBinding(o.after)}, which listens on all host interfaces.`,
          possibleConsequence: `Port ${o.before.published} could become reachable from other machines on the network, depending on host firewall rules.`,
          reason: "Without a host IP, Docker publishes a port on all interfaces. A 127.0.0.1 binding limits access to the host itself.",
          basis: "inferred",
          evidence: baseEvidence,
          relationships: [],
          confidence: { level: "high", uncertainty: ["Host firewall and cloud security group rules are not visible."] },
        });
      }
    }
  }
  return findings;
}
