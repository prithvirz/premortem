import { diffCompose, type ComposeDiff } from "./diff";
import { parseCompose } from "./parse";
import { parsePolicy } from "./policy";
import { dependencyDanglingRule } from "./rules/dependency";
import { envRequiredRule } from "./rules/env";
import { networkLostRule, networkUndefinedRule } from "./rules/network";
import { portsRule } from "./rules/ports";
import type { Rule } from "./rules/types";
import type { Diagnostic, Finding, NormalizedCompose, RequiredEnvPolicy, Severity } from "./types";

export const RULES: Rule[] = [dependencyDanglingRule, networkUndefinedRule, networkLostRule, portsRule, envRequiredRule];

export const LIMITATIONS = [
  "Static analysis of the two files only. Nothing is run, and no runtime failure is predicted with certainty.",
  "Images, commands, application code, env_file contents, and environment values are not inspected.",
  "`include`, `extends`, multiple -f files, and variable interpolation are not resolved.",
  "Profiles are not evaluated; every service is treated as part of the deployment.",
];

const SEVERITY_ORDER: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };

export type AnalysisInput = { before: string; after: string; policyText?: string; policy?: RequiredEnvPolicy };

export type AnalysisReport =
  | {
      ok: true;
      findings: Finding[];
      counts: Record<Severity, number>;
      diff: ComposeDiff;
      /** Secret-free normalized models, for visualization. */
      models: { before: NormalizedCompose; after: NormalizedCompose };
      diagnostics: { before: Diagnostic[]; after: Diagnostic[]; policy: Diagnostic[] };
      limitations: string[];
    }
  | {
      ok: false;
      diagnostics: { before: Diagnostic[]; after: Diagnostic[]; policy: Diagnostic[] };
    };

export function runRules(before: NormalizedCompose, after: NormalizedCompose, policy?: RequiredEnvPolicy): Finding[] {
  const all = RULES.flatMap((rule) => rule({ before, after, policy }));
  return all.sort(
    (x, y) => SEVERITY_ORDER[x.severity] - SEVERITY_ORDER[y.severity] || x.service.localeCompare(y.service) || x.id.localeCompare(y.id),
  );
}

/** Analyze BEFORE and AFTER Compose YAML. Pure and synchronous; safe to run in the browser. */
export function analyze(input: AnalysisInput): AnalysisReport {
  const b = parseCompose(input.before);
  const a = parseCompose(input.after);

  let policy = input.policy;
  let policyDiags: Diagnostic[] = [];
  if (!policy && input.policyText?.trim()) {
    const p = parsePolicy(input.policyText);
    if (p.ok) policy = p.policy;
    else policyDiags = p.diagnostics;
  }

  const diagnostics = {
    before: b.ok ? b.compose.diagnostics : b.diagnostics,
    after: a.ok ? a.compose.diagnostics : a.diagnostics,
    policy: policyDiags,
  };
  if (!b.ok || !a.ok) return { ok: false, diagnostics };

  const findings = runRules(b.compose, a.compose, policy);
  const counts: Record<Severity, number> = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  for (const f of findings) counts[f.severity]++;

  return { ok: true, findings, counts, diff: diffCompose(b.compose, a.compose), models: { before: b.compose, after: a.compose }, diagnostics, limitations: LIMITATIONS };
}
