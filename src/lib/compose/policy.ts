import { parseYamlSafely } from "./parse";
import type { Diagnostic, RequiredEnvPolicy } from "./types";

const ENV_NAME = /^[A-Za-z_][A-Za-z0-9_.-]*$/;

/**
 * Validate a policy object: `{ requiredEnv: { "*": ["VAR"], api: ["DATABASE_URL"] } }`.
 * Service key "*" applies to every service.
 */
export function validatePolicy(value: unknown): { ok: true; policy: RequiredEnvPolicy } | { ok: false; diagnostics: Diagnostic[] } {
  const bad = (message: string): { ok: false; diagnostics: Diagnostic[] } => ({
    ok: false,
    diagnostics: [{ level: "error", code: "policy-invalid", message }],
  });
  if (typeof value !== "object" || value === null || Array.isArray(value)) return bad("Policy must be a mapping.");
  const req = (value as Record<string, unknown>).requiredEnv;
  if (typeof req !== "object" || req === null || Array.isArray(req)) return bad("Policy needs a `requiredEnv` mapping.");
  const requiredEnv: Record<string, string[]> = {};
  for (const [svc, vars] of Object.entries(req)) {
    if (!Array.isArray(vars) || !vars.every((v) => typeof v === "string" && ENV_NAME.test(v))) {
      return bad(`requiredEnv.${svc} must be a list of environment variable names.`);
    }
    requiredEnv[svc] = vars as string[];
  }
  return { ok: true, policy: { requiredEnv } };
}

export function parsePolicy(text: string) {
  const parsed = parseYamlSafely(text);
  if (!parsed.ok) return parsed;
  return validatePolicy(parsed.value);
}
