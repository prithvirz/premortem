import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { analyze } from "@/lib/compose/analyze";
import { parseCompose } from "@/lib/compose/parse";
import { SCENARIOS } from "@/lib/examples/scenarios";

const root = join(__dirname, "..", "validation");
const fixture = (p: string) => readFileSync(join(root, "fixtures", p), "utf8");
const expected = JSON.parse(readFileSync(join(root, "expected.json"), "utf8")) as {
  config: { file: string; expect: "valid" | "invalid"; match?: string }[];
  premortem: { pair: [string, string]; validationFindings: number; inferredRuleIds: string[] }[];
};

describe("validation fixtures stay in sync with the example scenarios", () => {
  it.each(SCENARIOS)("$id", (s) => {
    expect(fixture(`${s.id}/before.yml`)).toBe(s.before);
    expect(fixture(`${s.id}/after.yml`)).toBe(s.after);
  });
});

describe("static engine agrees with the Docker expectations", () => {
  it.each(expected.premortem)("$pair.1", (e) => {
    const r = analyze({ before: fixture(e.pair[0]), after: fixture(e.pair[1]) });
    if (!r.ok) throw new Error(JSON.stringify(r.diagnostics));
    expect(r.findings.filter((f) => f.basis === "compose-validation")).toHaveLength(e.validationFindings);
    const inferred = [...new Set(r.findings.filter((f) => f.basis === "inferred" && f.severity !== "info").map((f) => f.ruleId))].sort();
    expect(inferred).toEqual([...e.inferredRuleIds].sort());
  });

  it("every file Docker should reject is one PreMortem flags as a Compose validation failure, and vice versa", () => {
    const empty = "services:\n  placeholder: { image: x }\n";
    for (const c of expected.config) {
      const after = fixture(c.file);
      expect(parseCompose(after).ok).toBe(true);
      const r = analyze({ before: empty, after });
      if (!r.ok) throw new Error(c.file);
      const validation = r.findings.some((f) => f.basis === "compose-validation");
      expect([c.file, validation]).toEqual([c.file, c.expect === "invalid"]);
    }
  });
});
