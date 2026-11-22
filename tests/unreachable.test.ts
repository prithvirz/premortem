import { describe, expect, it } from "vitest";
import { analyze } from "@/lib/compose/analyze";
import { reachability, sharesNetwork } from "@/lib/compose/graph";
import { parseCompose } from "@/lib/compose/parse";
import { SCENARIOS } from "@/lib/examples/scenarios";
import { buildGraphModel } from "@/lib/viz/graph";
import { buildHeadline } from "@/lib/viz/headline";
import { viewGraph } from "@/lib/viz/view";

function findings(before: string, after: string) {
  const r = analyze({ before, after });
  if (!r.ok) throw new Error(JSON.stringify(r.diagnostics));
  return r.findings;
}
const rule = (before: string, after: string) => findings(before, after).filter((f) => f.ruleId === "dependency-unreachable");
const model = (yaml: string) => {
  const r = parseCompose(yaml);
  if (!r.ok) throw new Error("parse");
  return r.compose;
};

describe("dependency-unreachable: positive cases", () => {
  it("flags a new dependency on a service on a different network (inferred, medium)", () => {
    const before = "services:\n  app: { image: a }\n";
    const after = "services:\n  app: { image: a, depends_on: [db] }\n  db: { image: pg, networks: [data] }\nnetworks: { data: {} }\n";
    const f = rule(before, after);
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ id: "dependency-unreachable:app:db:depends_on", severity: "medium", basis: "inferred", service: "app", title: "app → db: no shared network" });
    expect(f[0]!.reason).toMatch(/controls start order/);
    expect(f[0]!.possibleConsequence).toMatch(/may be unable/);
    expect(f[0]!.relationships[0]).toMatchObject({ status: "at-risk" });
  });
  it("rates links higher than depends_on, since links implies communication", () => {
    const f = rule("services:\n  app: { image: a }\n", "services:\n  app: { image: a, links: [db] }\n  db: { image: pg, networks: [data] }\nnetworks: { data: {} }\n");
    expect(f[0]).toMatchObject({ severity: "high", confidence: { level: "high" } });
  });
  it("flags a newly declared relationship between existing services that never shared a network", () => {
    const before = "services:\n  app: { image: a, networks: [x] }\n  db: { image: pg, networks: [y] }\nnetworks: { x: {}, y: {} }\n";
    const after = "services:\n  app: { image: a, networks: [x], depends_on: [db] }\n  db: { image: pg, networks: [y] }\nnetworks: { x: {}, y: {} }\n";
    expect(rule(before, after)[0]).toMatchObject({ severity: "medium" });
  });
  it("respects the implicit default network: a service with no networks key is not on a named network", () => {
    const after = "services:\n  app: { image: a, depends_on: [db] }\n  db: { image: pg, networks: [data] }\nnetworks: { data: {} }\n";
    expect(rule("services:\n  app: { image: a }\n", after)).toHaveLength(1);
    const joined = "services:\n  app: { image: a, depends_on: [db] }\n  db: { image: pg, networks: [default, data] }\nnetworks: { data: {} }\n";
    expect(rule("services:\n  app: { image: a }\n", joined)).toEqual([]);
  });
  it("names the services in the verdict headline", () => {
    const f = findings("services:\n  app: { image: a }\n", "services:\n  app: { image: a, depends_on: [db] }\n  db: { image: pg, networks: [data] }\nnetworks: { data: {} }\n");
    expect(buildHeadline(f)?.text).toBe("app → db: no shared network");
  });
  it("draws the edge as possibly affected (not severed) in the graph", () => {
    const before = "services:\n  app: { image: a }\n";
    const after = "services:\n  app: { image: a, depends_on: [db] }\n  db: { image: pg, networks: [data] }\nnetworks: { data: {} }\n";
    const r = analyze({ before, after });
    if (!r.ok) throw new Error();
    const m = buildGraphModel(r.models.before, r.models.after, r.diff, r.findings);
    const e = viewGraph(m, "after").edges.find((x) => x.id === "e:depends_on:app->db")!;
    expect(e).toMatchObject({ visual: "at-risk", label: "no shared network" });
  });
});

describe("dependency-unreachable: negative cases", () => {
  it("is silent when services share a network", () => {
    const y = "services:\n  app: { image: a, depends_on: [db], networks: [n] }\n  db: { image: pg, networks: [n] }\nnetworks: { n: {} }\n";
    expect(rule("services:\n  app: { image: a }\n", y)).toEqual([]);
  });
  it("does not duplicate network-lost for pairs that shared a network in BEFORE", () => {
    const s = SCENARIOS.find((x) => x.id === "severed-cache")!;
    const f = findings(s.before, s.after);
    expect(f.filter((x) => x.ruleId === "dependency-unreachable")).toEqual([]);
    expect(f.filter((x) => x.ruleId === "network-lost" && x.severity === "high")).toHaveLength(1);
  });
  it("leaves missing targets to dependency-dangling and undeclared networks to network-undefined", () => {
    expect(rule("services:\n  app: { image: a }\n", "services:\n  app: { image: a, depends_on: [ghost] }\n")).toEqual([]);
    const undeclared = "services:\n  app: { image: a, depends_on: [db] }\n  db: { image: pg, networks: [nope] }\n";
    const f = findings("services:\n  app: { image: a }\n", undeclared);
    expect(f.map((x) => x.ruleId)).toEqual(["network-undefined"]);
  });
  it("reports an already disconnected relationship as unchanged info, not a new risk", () => {
    const y = "services:\n  app: { image: a, depends_on: [db], networks: [x] }\n  db: { image: pg, networks: [y] }\nnetworks: { x: {}, y: {} }\n";
    const f = rule(y, y);
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ severity: "info", confidence: { level: "low" } });
    expect(f[0]!.title).toMatch(/unchanged from BEFORE/);
    expect(buildHeadline(findings(y, y))).toBeNull();
  });
  it("an informational finding never hides or restyles a declared edge", () => {
    const y = "services:\n  app: { image: a, depends_on: [db], networks: [x] }\n  db: { image: pg, networks: [y] }\nnetworks: { x: {}, y: {} }\n";
    const r = analyze({ before: y, after: y });
    if (!r.ok) throw new Error();
    const m = buildGraphModel(r.models.before, r.models.after, r.diff, r.findings);
    const e = viewGraph(m, "after").edges.find((x) => x.id === "e:depends_on:app->db")!;
    expect(e.visual).toBe("steady");
    expect(e.findingIds).toEqual(["dependency-unreachable:app:db:depends_on"]);
  });
  it("treats external and named networks by their Docker name", () => {
    const after = "services:\n  app: { image: a, depends_on: [db], networks: [ext] }\n  db: { image: pg, networks: [mine] }\nnetworks:\n  ext: { external: true, name: shared }\n  mine: { name: shared }\n";
    expect(sharesNetwork(model(after), "app", "db")).toBe(true);
    expect(rule("services:\n  app: { image: a }\n", after)).toEqual([]);
    const different = after.replace("mine: { name: shared }", "mine: { name: other }");
    expect(rule("services:\n  app: { image: a }\n", different)).toHaveLength(1);
  });
  it("two services on the same external network share it", () => {
    const after = "services:\n  app: { image: a, depends_on: [db], networks: [proxy] }\n  db: { image: pg, networks: [proxy] }\nnetworks: { proxy: { external: true } }\n";
    expect(rule("services:\n  app: { image: a }\n", after)).toEqual([]);
  });
});

describe("dependency-unreachable: special network modes", () => {
  const before = "services:\n  app: { image: a }\n";
  it("network_mode: service:X inherits X's networks", () => {
    const after = "services:\n  app: { image: a, depends_on: [db], network_mode: 'service:vpn' }\n  vpn: { image: v, networks: [n] }\n  db: { image: pg, networks: [n] }\nnetworks: { n: {} }\n";
    expect(reachability(model(after), "app", "db")).toBe("shared");
    expect(rule(before, after)).toEqual([]);
  });
  it.each(["host", "none", "bridge", "container:abc123"])("network_mode: %s is reported as not analyzed, never as a failure", (mode) => {
    const after = `services:\n  app: { image: a, depends_on: [db], network_mode: '${mode}' }\n  db: { image: pg, networks: [n] }\nnetworks: { n: {} }\n`;
    const f = rule(before, after);
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ severity: "info", confidence: { level: "low" } });
    expect(f[0]!.title).toMatch(/not analyzed/);
    expect(f[0]!.relationships[0]!.status).toBe("unaffected");
  });
  it("two host-mode services share the host namespace", () => {
    const after = "services:\n  app: { image: a, depends_on: [db], network_mode: host }\n  db: { image: pg, network_mode: host }\n";
    expect(rule(before, after)).toEqual([]);
  });
  it("network_mode relationships themselves are not checked", () => {
    const after = "services:\n  app: { image: a, network_mode: 'service:vpn' }\n  vpn: { image: v }\n";
    expect(rule(before, after)).toEqual([]);
  });
});

describe("existing scenarios are unchanged by the new rule", () => {
  it.each(SCENARIOS)("$name", (s) => {
    const r = analyze({ before: s.before, after: s.after, policy: s.policy });
    if (!r.ok) throw new Error();
    expect(r.findings.filter((f) => f.ruleId === "dependency-unreachable")).toEqual([]);
  });
});
