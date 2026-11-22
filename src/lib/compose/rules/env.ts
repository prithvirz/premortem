import { ev } from "../graph";
import type { Finding } from "../types";
import type { RuleContext } from "./types";

/** Variables a provided policy requires that were declared in BEFORE and are no longer declared in AFTER. */
export function envRequiredRule(ctx: RuleContext): Finding[] {
  const { before, after, policy } = ctx;
  if (!policy) return [];
  const findings: Finding[] = [];
  const wildcard = policy.requiredEnv["*"] ?? [];

  for (const name of Object.keys(before.services).sort()) {
    const b = before.services[name];
    const a = after.services[name];
    if (!b || !a) continue;
    const required = [...new Set([...wildcard, ...(policy.requiredEnv[name] ?? [])])].sort();

    for (const variable of required) {
      if (!(variable in b.env) || variable in a.env) continue;
      const fileProvided = a.envFiles.length > 0;
      findings.push({
        id: `env-required-removed:${name}:${variable}`,
        ruleId: "env-required-removed",
        severity: fileProvided ? "medium" : "high",
        service: name,
        title: `${name} no longer declares required variable ${variable}`,
        confirmedChange: `BEFORE declared ${variable} in services.${name}.environment. AFTER does not declare it there.`,
        possibleConsequence: fileProvided
          ? `If no env_file supplies ${variable}, "${name}" could start without it and fail or misbehave.`
          : `"${name}" could start without ${variable} and fail or misbehave when it is read.`,
        reason: `The provided policy requires ${variable} on "${name}". Values are never read or reported; only whether the variable is declared.`,
        basis: "policy",
        evidence: [
          ev("before", `services.${name}.environment`, `declares ${variable}`),
          ev("after", `services.${name}.environment`, `[${Object.keys(a.env).join(", ")}]`),
          ev("after", `services.${name}.env_file`, a.envFiles.length > 0 ? `[${a.envFiles.join(", ")}]` : "(none)"),
        ],
        relationships: [],
        confidence: {
          level: fileProvided ? "low" : "high",
          uncertainty: [
            ...(fileProvided ? [`env_file contents are not read, so ${variable} may be supplied there.`] : []),
            "The image may bake in a default, or the variable may be injected by the deployment platform.",
          ],
        },
      });
    }
  }
  return findings;
}
