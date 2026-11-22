import { describeBinding } from "./ports";
import { redact } from "./redact";
import type { NormalizedCompose } from "./types";

export interface ServiceDiff {
  name: string;
  image?: { before?: string; after?: string };
  networksAdded: string[];
  networksRemoved: string[];
  portsAdded: string[];
  portsRemoved: string[];
  dependsOnAdded: string[];
  dependsOnRemoved: string[];
  envKeysAdded: string[];
  envKeysRemoved: string[];
  volumesAdded: string[];
  volumesRemoved: string[];
}

export interface ComposeDiff {
  servicesAdded: string[];
  servicesRemoved: string[];
  networksAdded: string[];
  networksRemoved: string[];
  volumesAdded: string[];
  volumesRemoved: string[];
  /** Only services present in both versions with at least one difference. */
  changedServices: ServiceDiff[];
}

const sub = (a: string[], b: string[]): string[] => a.filter((x) => !b.includes(x)).sort();

/** Neutral structural diff of two normalized files. Findings are produced separately by rules. */
export function diffCompose(before: NormalizedCompose, after: NormalizedCompose): ComposeDiff {
  const bNames = Object.keys(before.services);
  const aNames = Object.keys(after.services);
  const changedServices: ServiceDiff[] = [];

  for (const name of bNames.filter((n) => aNames.includes(n)).sort()) {
    const b = before.services[name]!;
    const a = after.services[name]!;
    const d: ServiceDiff = {
      name,
      networksAdded: sub(a.networks, b.networks),
      networksRemoved: sub(b.networks, a.networks),
      portsAdded: sub(a.ports.map(describeBinding), b.ports.map(describeBinding)),
      portsRemoved: sub(b.ports.map(describeBinding), a.ports.map(describeBinding)),
      dependsOnAdded: sub(a.dependsOn.map((x) => x.service), b.dependsOn.map((x) => x.service)),
      dependsOnRemoved: sub(b.dependsOn.map((x) => x.service), a.dependsOn.map((x) => x.service)),
      envKeysAdded: sub(Object.keys(a.env), Object.keys(b.env)),
      envKeysRemoved: sub(Object.keys(b.env), Object.keys(a.env)),
      volumesAdded: sub(a.volumes.map((v) => v.target), b.volumes.map((v) => v.target)),
      volumesRemoved: sub(b.volumes.map((v) => v.target), a.volumes.map((v) => v.target)),
    };
    if (b.image !== a.image) d.image = { before: b.image && redact(b.image), after: a.image && redact(a.image) };
    const changed = Object.entries(d).some(([k, v]) => k !== "name" && (Array.isArray(v) ? v.length > 0 : v !== undefined));
    if (changed) changedServices.push(d);
  }

  const bNets = Object.keys(before.networks);
  const aNets = Object.keys(after.networks);
  return {
    servicesAdded: sub(aNames, bNames),
    servicesRemoved: sub(bNames, aNames),
    networksAdded: sub(aNets, bNets),
    networksRemoved: sub(bNets, aNets),
    volumesAdded: sub(after.volumes, before.volumes),
    volumesRemoved: sub(before.volumes, after.volumes),
    changedServices,
  };
}
