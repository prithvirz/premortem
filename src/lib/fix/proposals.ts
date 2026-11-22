import { effectiveNetworks } from "../compose/graph";
import type { Finding, NormalizedCompose } from "../compose/types";
import { attachNetwork, retargetDependency, type PatchResult } from "./patch";

export type FixKind = "attach-network" | "retarget-dependency";

export interface FieldChange {
  service: string;
  /** Compose path, e.g. services.api.networks */
  path: string;
  before: string;
  after: string;
}

export interface FixOption {
  id: string;
  kind: FixKind;
  label: string;
  recommended: boolean;
  changes: FieldChange[];
  /** Option-specific disclosures (security or semantic side effects). */
  disclosures: string[];
  /** Problems the rules would not report but the preview must not hide (shown prominently). */
  warnings: string[];
  /** Must be acknowledged before preview, e.g. a rename that is only a heuristic. */
  confirmation?: string;
  /** Proposed AFTER text, already verified by the patcher. */
  patchedAfter: string;
}

export type FixOffer =
  | { eligible: true; findingId: string; kind: FixKind; title: string; explanation: string; options: FixOption[]; notes: string[] }
  | { eligible: false; findingId: string; reason: string };

const list = (xs: string[]) => `[${xs.join(", ")}]`;

function networkKeysText(c: NormalizedCompose, svc: string): string {
  const s = c.services[svc];
  if (!s) return "(absent)";
  return s.networksExplicit ? list(s.networks) : "(no networks key: implicit default)";
}

function attachedText(c: NormalizedCompose, svc: string, net: string): string {
  const s = c.services[svc]!;
  return list(s.networksExplicit ? [...s.networks, net] : net === "default" ? ["default"] : ["default", net]);
}

function membersOf(c: NormalizedCompose, net: string): string[] {
  const id = c.networks[net]?.identity ?? `project:${net}`;
  return Object.keys(c.services).filter((n) => effectiveNetworks(c, n).has(id)).sort();
}

function networkOffer(f: Finding, after: NormalizedCompose, afterText: string): FixOffer {
  const deny = (reason: string): FixOffer => ({ eligible: false, findingId: f.id, reason });
  if (f.severity === "info") return deny("No dependency or link connects these services, so the separation may be intentional. PreMortem does not suggest reconnecting them.");
  const declared = f.relationships.find((r) => r.type !== "network" && r.status === "broken");
  if (!declared) return deny("The relationship was also removed in AFTER, which suggests the separation is intentional. No reconnection is suggested.");
  const owner = declared.from;
  const other = declared.to;
  const a = after.services[owner];
  const b = after.services[other];
  if (!a || !b) return deny("One of the services is missing from AFTER.");
  if (a.networkMode || b.networkMode) return deny("One of the services uses network_mode, which PreMortem does not edit automatically.");

  const candidates: { svc: string; net: string; recommended: boolean }[] = [];
  b.networks.filter((n) => !a.networks.includes(n)).forEach((net, i) => candidates.push({ svc: owner, net, recommended: i === 0 }));
  a.networks.filter((n) => !b.networks.includes(n)).forEach((net) => candidates.push({ svc: other, net, recommended: false }));

  const options: FixOption[] = [];
  const reasons: string[] = [];
  for (const c of candidates) {
    const result: PatchResult = attachNetwork(afterText, c.svc, c.net);
    if (!result.ok) {
      reasons.push(result.reason);
      continue;
    }
    const members = membersOf(after, c.net);
    const def = after.networks[c.net];
    options.push({
      id: `attach:${c.svc}:${c.net}`,
      kind: "attach-network",
      label: `Attach ${c.svc} to network "${c.net}"`,
      recommended: c.recommended,
      changes: [{ service: c.svc, path: `services.${c.svc}.networks`, before: networkKeysText(after, c.svc), after: attachedText(after, c.svc, c.net) }],
      disclosures: [
        `"${c.svc}" would be able to reach every service on "${c.net}" (${members.join(", ") || "none"}), and they could reach it. If "${c.net}" was split out to isolate them, this weakens that isolation.`,
        ...(def?.external ? [`"${c.net}" is an external network managed outside this project; other stacks may be attached to it.`] : []),
      ],
      warnings: [],
      patchedAfter: result.text,
    });
  }
  if (options.length === 0) return deny(reasons[0] ?? "There is no network that one service could join to share with the other.");
  if (!options.some((o) => o.recommended)) options[0]!.recommended = true;

  return {
    eligible: true,
    findingId: f.id,
    kind: "attach-network",
    title: `Reconnect ${owner} → ${other} through a shared network`,
    explanation: `"${owner}" still declares ${declared.type} on "${other}", but no network connects them in AFTER. Attaching one of them to a network the other is on would restore a shared network.`,
    options,
    notes: ["Only the networks list of one service changes. Nothing else in the file is edited."],
  };
}

function dependencyOffer(f: Finding, before: NormalizedCompose, after: NormalizedCompose, afterText: string): FixOffer {
  const deny = (reason: string): FixOffer => ({ eligible: false, findingId: f.id, reason });
  const target = f.id.split(":")[2]!;
  const old = before.services[target];
  if (!old) return deny(`"${target}" was not defined in BEFORE either, so there is no earlier service to match it against.`);
  if (target in after.services) return deny(`"${target}" is defined in AFTER.`);

  const refs = Object.values(after.services)
    .filter((s) => s.dependsOn.some((d) => d.service === target) || s.links.includes(target) || s.networkMode === `service:${target}`)
    .map((s) => s.name)
    .sort();
  const candidates = Object.values(after.services)
    .filter((s) => !(s.name in before.services))
    .filter((s) => (old.image !== undefined && s.image === old.image) || (old.build !== undefined && s.build === old.build))
    .map((s) => s.name)
    .sort();
  if (candidates.length === 0) {
    return deny(`No service added in AFTER has the same image or build context as "${target}", so PreMortem cannot suggest a replacement. Restore "${target}" or update the references by hand.`);
  }

  const options: FixOption[] = [];
  const reasons: string[] = [];
  for (const cand of candidates) {
    const result = retargetDependency(afterText, refs, target, cand);
    if (!result.ok) {
      reasons.push(result.reason);
      continue;
    }
    const s = after.services[cand]!;
    const match = old.image !== undefined && s.image === old.image ? `image ${old.image}` : `build context ${old.build}`;
    const changes: FieldChange[] = [];
    for (const r of refs) {
      const svc = after.services[r]!;
      if (svc.dependsOn.some((d) => d.service === target)) {
        const names = svc.dependsOn.map((d) => d.service);
        changes.push({ service: r, path: `services.${r}.depends_on`, before: list(names), after: list(names.map((n) => (n === target ? cand : n))) });
      }
      if (svc.links.includes(target)) changes.push({ service: r, path: `services.${r}.links`, before: target, after: `${cand}:${target} (old name kept as alias)` });
    }
    options.push({
      id: `retarget:${target}:${cand}`,
      kind: "retarget-dependency",
      label: `Point references to "${target}" at "${cand}"`,
      recommended: candidates.length === 1,
      changes,
      disclosures: [
        `"${cand}" was added in AFTER with the same ${match} as "${target}". That is a hint, not proof that it is a rename.`,
        `If application code connects to the hostname "${target}", it would also need to change; PreMortem does not read code or environment values.`,
      ],
      // Reachability of the new target is reported by the engine (dependency-unreachable) on reanalysis.
      warnings: [],
      confirmation: `I have checked that "${cand}" replaces "${target}".`,
      patchedAfter: result.text,
    });
  }
  if (options.length === 0) return deny(reasons[0] ?? "The references could not be updated safely.");
  return {
    eligible: true,
    findingId: f.id,
    kind: "retarget-dependency",
    title: `Point ${refs.join(", ")} at a replacement for "${target}"`,
    explanation: `"${target}" was removed, but ${refs.length === 1 ? `"${refs[0]}" still references it` : `${refs.length} services still reference it`}. ${candidates.length === 1 ? "One added service looks like its replacement." : `${candidates.length} added services could be its replacement; choose one.`}`,
    options,
    notes: [`Every reference to "${target}" in AFTER is updated together, so the result is consistent.`],
  };
}

/** Decide whether a finding has a supported, safely patchable correction. Pure. */
export function proposeFix(f: Finding, before: NormalizedCompose, after: NormalizedCompose, afterText: string): FixOffer {
  if (f.ruleId === "network-lost") return networkOffer(f, after, afterText);
  if (f.ruleId === "dependency-dangling") {
    if (!f.id.endsWith(":depends_on") && !f.id.endsWith(":links")) {
      return { eligible: false, findingId: f.id, reason: "network_mode references are not edited automatically." };
    }
    return dependencyOffer(f, before, after, afterText);
  }
  if (f.ruleId === "dependency-unreachable") {
    return {
      eligible: false,
      findingId: f.id,
      reason: "Which network should connect them is a design choice (it changes isolation), so no automatic correction is offered. Attach one service to a network the other uses, or confirm the dependency only orders startup.",
    };
  }
  return {
    eligible: false,
    findingId: f.id,
    reason:
      f.basis === "policy"
        ? "Restoring a required variable needs its value, which PreMortem never reads or invents."
        : "No automatic correction is offered for this kind of finding; the right value depends on how the service is used.",
  };
}
