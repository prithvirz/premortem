import { redact } from "./redact";
import type { Evidence, NormalizedCompose, Relationship } from "./types";

/**
 * Identities of the real Docker networks a service can reach.
 *
 * Compose semantics applied here:
 * - No `networks` key: the service joins the project's `default` network.
 * - `network_mode: service:X` shares X's network namespace, so it gets X's networks.
 * - `network_mode: host` joins the host namespace; `none` joins nothing.
 * - Top-level `name:` / `external:` decide whether two keys are the same real network.
 */
export function effectiveNetworks(c: NormalizedCompose, name: string, seen = new Set<string>()): Set<string> {
  const svc = c.services[name];
  const out = new Set<string>();
  if (!svc || seen.has(name)) return out;
  seen.add(name);

  const mode = svc.networkMode;
  if (mode) {
    if (mode === "host") out.add("builtin:host");
    else if (mode === "bridge") out.add("builtin:bridge");
    else if (mode.startsWith("service:")) {
      for (const id of effectiveNetworks(c, mode.slice("service:".length), seen)) out.add(id);
    }
    return out;
  }
  for (const key of svc.networks) out.add(c.networks[key]?.identity ?? `project:${key}`);
  return out;
}

/**
 * The Docker-level network a Compose identity refers to. `external: true` and `name: X` both mean the
 * Docker network literally named X, so they are the same network even under different keys.
 */
export function dockerNetwork(identity: string): string {
  return identity.replace(/^(external|named):/, "docker:");
}

export function sharesNetwork(c: NormalizedCompose, a: string, b: string): boolean {
  const na = new Set([...effectiveNetworks(c, a)].map(dockerNetwork));
  for (const id of effectiveNetworks(c, b)) if (na.has(dockerNetwork(id))) return true;
  return false;
}

export type Reachability = "shared" | "none" | "unknown";

/**
 * Whether two services can reach each other over a Compose network, judged from configuration.
 * network_mode values other than `service:X` (host, none, bridge, container:...) are "unknown":
 * their connectivity depends on the host, so no failure is inferred.
 */
export function reachability(c: NormalizedCompose, a: string, b: string): Reachability {
  const resolvesToSpecial = (name: string, seen = new Set<string>()): boolean => {
    const m = c.services[name]?.networkMode;
    if (!m || seen.has(name)) return false;
    if (!m.startsWith("service:")) return true;
    seen.add(name);
    return resolvesToSpecial(m.slice(8), seen);
  };
  // Both in the host namespace (or sharing one via service:X) counts as shared.
  if (sharesNetwork(c, a, b)) return "shared";
  if (resolvesToSpecial(a) || resolvesToSpecial(b)) return "unknown";
  return "none";
}

export interface DeclaredLink {
  from: string;
  to: string;
  type: "depends_on" | "links" | "network_mode";
}

/** Directed service relationships declared in the file (targets may be undefined services). */
export function declaredLinks(c: NormalizedCompose): DeclaredLink[] {
  const out: DeclaredLink[] = [];
  for (const svc of Object.values(c.services)) {
    for (const d of svc.dependsOn) out.push({ from: svc.name, to: d.service, type: "depends_on" });
    for (const l of svc.links) out.push({ from: svc.name, to: l, type: "links" });
    if (svc.networkMode?.startsWith("service:")) {
      out.push({ from: svc.name, to: svc.networkMode.slice("service:".length), type: "network_mode" });
    }
  }
  return out;
}

export function ev(side: "before" | "after", path: string, value: string): Evidence {
  return { side, path, value: redact(value) };
}

export function rel(
  from: string,
  to: string,
  type: Relationship["type"],
  status: Relationship["status"],
  note?: string,
): Relationship {
  return { from, to, type, status, note };
}

export function formatList(items: string[]): string {
  return items.length === 0 ? "(none)" : items.join(", ");
}

export function networkKeysEvidence(c: NormalizedCompose, service: string): string {
  const svc = c.services[service];
  if (!svc) return "(service absent)";
  if (svc.networkMode) return `network_mode: ${svc.networkMode}`;
  if (!svc.networksExplicit) return "(no `networks` key; joins implicit `default`)";
  return `[${svc.networks.join(", ")}]`;
}
