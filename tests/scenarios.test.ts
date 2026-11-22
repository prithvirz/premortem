import { describe, expect, it } from "vitest";
import { analyze } from "@/lib/compose/analyze";
import { parsePolicy } from "@/lib/compose/policy";
import { SCENARIOS } from "@/lib/examples/scenarios";

describe.each(SCENARIOS)("scenario: $name", (s) => {
  const report = analyze({ before: s.before, after: s.after, policy: s.policy });

  it("produces exactly the expected findings", () => {
    expect(report.ok).toBe(true);
    if (!report.ok) return;
    const actual = report.findings.map((f) => ({ ruleId: f.ruleId, service: f.service, severity: f.severity }));
    const key = (x: { ruleId: string; service: string }) => `${x.ruleId}:${x.service}`;
    expect([...actual].sort((a, b) => key(a).localeCompare(key(b)))).toEqual(
      [...s.expected].sort((a, b) => key(a).localeCompare(key(b))),
    );
  });

  it("gives every finding evidence, a reason, and an uncertainty statement", () => {
    if (!report.ok) throw new Error("not ok");
    for (const f of report.findings) {
      expect(f.evidence.length).toBeGreaterThan(0);
      expect(f.reason.length).toBeGreaterThan(20);
      expect(f.confirmedChange.length).toBeGreaterThan(10);
      expect(f.possibleConsequence).toMatch(/\b(may|might|could|expected|if)\b/i);
      expect(f.confidence.uncertainty.length).toBeGreaterThan(0);
    }
  });

  it("is deterministic and leaks no placeholder secret values", () => {
    const again = analyze({ before: s.before, after: s.after, policy: s.policy });
    expect(JSON.stringify(again)).toBe(JSON.stringify(report));
    expect(JSON.stringify(report)).not.toContain("change-me");
  });
});

describe("analyze error handling", () => {
  it("returns diagnostics for malformed input on either side", () => {
    const r = analyze({ before: "services: [", after: "services:\n  a: {image: x}\n" });
    expect(r.ok).toBe(false);
    expect(r.diagnostics.before[0]!.level).toBe("error");
    expect(r.diagnostics.after).toEqual([]);
  });
  it("reports invalid policy text without failing the analysis", () => {
    const y = "services:\n  a: {image: x}\n";
    const r = analyze({ before: y, after: y, policyText: "requiredEnv: [nope]" });
    expect(r.ok).toBe(true);
    expect(r.diagnostics.policy[0]!.code).toBe("policy-invalid");
  });
  it("parses a YAML policy", () => {
    expect(parsePolicy("requiredEnv:\n  api: [A_B]\n")).toMatchObject({ ok: true });
    expect(parsePolicy("requiredEnv:\n  api: ['bad name!']\n").ok).toBe(false);
  });
});
