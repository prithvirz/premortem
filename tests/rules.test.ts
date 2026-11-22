import { describe, expect, it } from "vitest";
import { analyze } from "@/lib/compose/analyze";
import type { Finding, RequiredEnvPolicy } from "@/lib/compose/types";

function run(before: string, after: string, policy?: RequiredEnvPolicy): Finding[] {
  const r = analyze({ before, after, policy });
  if (!r.ok) throw new Error(JSON.stringify(r.diagnostics));
  return r.findings;
}
const by = (f: Finding[], ruleId: string) => f.filter((x) => x.ruleId === ruleId);

describe("no-change and benign changes", () => {
  const base = `services:
  web: { image: nginx, ports: ["80:80"], depends_on: [api] }
  api: { image: acme/api }
`;
  it("reports nothing for identical files", () => {
    expect(run(base, base)).toEqual([]);
  });
  it("ignores key reordering and service addition", () => {
    const after = `services:
  worker: { image: acme/w, depends_on: [api] }
  api: { image: acme/api }
  web: { depends_on: [api], ports: ["80:80"], image: nginx }
`;
    expect(run(base, after)).toEqual([]);
  });
  it("ignores added ports, removed `expose`, and image bumps", () => {
    const after = `services:
  web: { image: nginx:2, ports: ["80:80", "443:443"], depends_on: [api] }
  api: { image: acme/api:2, expose: ["3000"] }
`;
    expect(run(base, after)).toEqual([]);
  });
});

describe("network-lost", () => {
  it("does not flag moving every service from the implicit default to one explicit network", () => {
    const before = "services:\n  a: { image: x, depends_on: [b] }\n  b: { image: x }\n";
    const after = "services:\n  a: { image: x, depends_on: [b], networks: [app] }\n  b: { image: x, networks: [app] }\nnetworks: { app: {} }\n";
    expect(run(before, after)).toEqual([]);
  });
  it("does not flag when both keep one of several shared networks", () => {
    const before = "services:\n  a: { image: x, networks: [n1, n2] }\n  b: { image: x, networks: [n1, n2] }\nnetworks: { n1: {}, n2: {} }\n";
    const after = "services:\n  a: { image: x, networks: [n1] }\n  b: { image: x, networks: [n1, n2] }\nnetworks: { n1: {}, n2: {} }\n";
    expect(run(before, after)).toEqual([]);
  });
  it("treats a renamed network key with the same real name as unchanged", () => {
    const before = "services:\n  a: { image: x, depends_on: [b], networks: [old] }\n  b: { image: x, networks: [old] }\nnetworks: { old: { name: shared } }\n";
    const after = "services:\n  a: { image: x, depends_on: [b], networks: [renamed] }\n  b: { image: x, networks: [renamed] }\nnetworks: { renamed: { name: shared } }\n";
    expect(run(before, after)).toEqual([]);
  });
  it("flags a key renamed on only one side as high when depends_on remains", () => {
    const before = "services:\n  a: { image: x, depends_on: [b], networks: [n] }\n  b: { image: x, networks: [n] }\nnetworks: { n: {} }\n";
    const after = "services:\n  a: { image: x, depends_on: [b], networks: [n] }\n  b: { image: x, networks: [m] }\nnetworks: { n: {}, m: {} }\n";
    const f = by(run(before, after), "network-lost");
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ severity: "high", service: "a", basis: "inferred" });
    expect(f[0]!.confidence.uncertainty.length).toBeGreaterThan(0);
  });
  it("flags leaving the implicit default for an explicit network", () => {
    const before = "services:\n  a: { image: x, links: [b] }\n  b: { image: x }\n";
    const after = "services:\n  a: { image: x, links: [b] }\n  b: { image: x, networks: [other] }\nnetworks: { other: {} }\n";
    expect(by(run(before, after), "network-lost")[0]).toMatchObject({ severity: "high", service: "a" });
  });
  it("lowers severity when the relationship was removed as well", () => {
    const before = "services:\n  a: { image: x, depends_on: [b] }\n  b: { image: x }\n";
    const after = "services:\n  a: { image: x, networks: [n] }\n  b: { image: x }\nnetworks: { n: {} }\n";
    expect(by(run(before, after), "network-lost")[0]).toMatchObject({ severity: "medium" });
  });
  it("flags switching to network_mode host", () => {
    const before = "services:\n  a: { image: x, depends_on: [b] }\n  b: { image: x }\n";
    const after = "services:\n  a: { image: x, depends_on: [b], network_mode: host }\n  b: { image: x }\n";
    expect(by(run(before, after), "network-lost")).toHaveLength(1);
  });
  it("keeps services sharing a namespace via network_mode: service:", () => {
    const before = "services:\n  a: { image: x }\n  vpn: { image: x }\n";
    const after = "services:\n  a: { image: x, network_mode: 'service:vpn' }\n  vpn: { image: x }\n";
    expect(by(run(before, after), "network-lost")).toEqual([]);
  });
  it("flags a reference to an undeclared network", () => {
    const before = "services:\n  a: { image: x }\n";
    const after = "services:\n  a: { image: x, networks: [ghost] }\n";
    expect(by(run(before, after), "network-undefined")[0]).toMatchObject({ severity: "critical", basis: "compose-validation" });
  });
});

describe("dependency-dangling", () => {
  it("flags depends_on pointing at a removed service", () => {
    const before = "services:\n  a: { image: x, depends_on: [b] }\n  b: { image: y }\n";
    const after = "services:\n  a: { image: x, depends_on: [b] }\n";
    const f = by(run(before, after), "dependency-dangling");
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ severity: "critical", service: "a", basis: "compose-validation" });
    expect(f[0]!.relationships[0]).toMatchObject({ from: "a", to: "b", status: "broken" });
  });
  it("suggests a rename candidate with the same image, as a heuristic", () => {
    const before = "services:\n  a: { image: x, depends_on: [db] }\n  db: { image: postgres:16 }\n";
    const after = "services:\n  a: { image: x, depends_on: [db] }\n  database: { image: postgres:16 }\n";
    const f = by(run(before, after), "dependency-dangling")[0]!;
    expect(f.confidence.uncertainty.join(" ")).toMatch(/Possible rename: "database"/);
  });
  it("flags links and network_mode targets", () => {
    const before = "services:\n  a: { image: x, links: [b], network_mode: 'service:b' }\n  b: { image: y }\n";
    const after = "services:\n  a: { image: x, links: [b], network_mode: 'service:b' }\n";
    expect(by(run(before, after), "dependency-dangling")).toHaveLength(2);
  });
  it("does not report a dangling reference that already existed in BEFORE", () => {
    const yaml = "services:\n  a: { image: x, depends_on: [ghost] }\n";
    expect(run(yaml, yaml)).toEqual([]);
  });
  it("reports a newly introduced reference to a never-defined service", () => {
    const before = "services:\n  a: { image: x }\n";
    const after = "services:\n  a: { image: x, depends_on: [typo] }\n";
    expect(by(run(before, after), "dependency-dangling")).toHaveLength(1);
  });
  it("downgrades optional dependencies with lower confidence", () => {
    const before = "services:\n  a: { image: x, depends_on: { b: { condition: service_started, required: false } } }\n  b: { image: y }\n";
    const after = "services:\n  a: { image: x, depends_on: { b: { condition: service_started, required: false } } }\n";
    expect(by(run(before, after), "dependency-dangling")[0]).toMatchObject({ severity: "high", confidence: { level: "medium" } });
  });
});

describe("ports", () => {
  const mk = (ports: string[], extra = "") =>
    `services:\n  web: { image: nginx, ports: ${JSON.stringify(ports)} }\n  api: { image: x, depends_on: [web] }\n${extra}`;
  it("flags a removed published port and marks internal traffic unaffected", () => {
    const f = by(run(mk(["80:80", "443:443"]), mk(["80:80"])), "port-removed");
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ severity: "medium", service: "web" });
    expect(f[0]!.relationships[0]).toMatchObject({ from: "api", to: "web", status: "unaffected" });
  });
  it("flags a changed host port only, not container-to-container traffic", () => {
    const f = run(mk(["8080:80"]), mk(["9090:80"]));
    expect(f.map((x) => x.ruleId)).toEqual(["port-host-changed"]);
  });
  it("raises a changed container port to high when a service depends on it", () => {
    const f = run(mk(["8080:80"]), mk(["8080:8000"]));
    expect(f.map((x) => [x.ruleId, x.severity])).toEqual([["port-target-changed", "high"]]);
    expect(f[0]!.relationships[0]).toMatchObject({ type: "container_port", status: "at-risk" });
  });
  it("keeps container port change at medium without dependents", () => {
    const b = 'services:\n  web: { image: nginx, ports: ["8080:80"] }\n';
    const a = 'services:\n  web: { image: nginx, ports: ["8080:8000"] }\n';
    expect(run(b, a)[0]).toMatchObject({ severity: "medium" });
  });
  it("flags loopback to all-interfaces widening, not the reverse", () => {
    expect(run(mk(["127.0.0.1:5432:5432"]), mk(["5432:5432"])).map((x) => x.ruleId)).toEqual(["port-exposure-widened"]);
    expect(run(mk(["5432:5432"]), mk(["127.0.0.1:5432:5432"]))).toEqual([]);
  });
  it("treats 80 and 80/tcp as equal and tcp vs udp as different", () => {
    expect(run(mk(["53:53"]), mk(["53:53/tcp"]))).toEqual([]);
    expect(run(mk(["53:53/udp"]), mk(["53:53/tcp"])).map((x) => x.ruleId)).toEqual(["port-removed"]);
  });
  it("handles long syntax equivalently to short syntax", () => {
    const b = "services:\n  web:\n    image: x\n    ports:\n      - { target: 80, published: 8080 }\n";
    const a = 'services:\n  web:\n    image: x\n    ports: ["8080:80"]\n';
    expect(run(b, a)).toEqual([]);
  });
  it("downgrades a port that moved to another service", () => {
    const b = 'services:\n  a: { image: x, ports: ["80:80"] }\n  b: { image: y }\n';
    const a = 'services:\n  a: { image: x }\n  b: { image: y, ports: ["80:80"] }\n';
    expect(run(b, a)[0]).toMatchObject({ ruleId: "port-removed", severity: "low", service: "a" });
  });
  it("ignores ephemeral host ports and interpolated entries rather than guessing", () => {
    const b = 'services:\n  a: { image: x, ports: ["80", "${P}:81"] }\n';
    const a = "services:\n  a: { image: x }\n";
    expect(run(b, a)).toEqual([]);
  });
  it("does not report ports for services that were removed", () => {
    const b = 'services:\n  a: { image: x, ports: ["80:80"] }\n  b: { image: y }\n';
    const a = "services:\n  b: { image: y }\n";
    expect(run(b, a)).toEqual([]);
  });
});

describe("env-required-removed", () => {
  const policy: RequiredEnvPolicy = { requiredEnv: { "*": ["LOG_LEVEL"], api: ["DB_URL"] } };
  it("flags a removed required variable with high confidence", () => {
    const b = "services:\n  api: { image: x, environment: { DB_URL: a, LOG_LEVEL: info } }\n";
    const a = "services:\n  api: { image: x, environment: { LOG_LEVEL: info } }\n";
    expect(run(b, a, policy)[0]).toMatchObject({ ruleId: "env-required-removed", severity: "high", basis: "policy", confidence: { level: "high" } });
  });
  it("applies the wildcard to all services", () => {
    const b = "services:\n  w: { image: x, environment: [LOG_LEVEL=1] }\n";
    const a = "services:\n  w: { image: x }\n";
    expect(run(b, a, policy)).toHaveLength(1);
  });
  it("lowers confidence when an env_file could supply the variable", () => {
    const b = "services:\n  api: { image: x, environment: [DB_URL=a, LOG_LEVEL=1] }\n";
    const a = "services:\n  api: { image: x, env_file: .env, environment: [LOG_LEVEL=1] }\n";
    expect(run(b, a, policy)[0]).toMatchObject({ severity: "medium", confidence: { level: "low" } });
  });
  it("accepts list form and bare passthrough names as declared", () => {
    const b = "services:\n  api: { image: x, environment: [DB_URL=a, LOG_LEVEL=1] }\n";
    const a = "services:\n  api: { image: x, environment: [DB_URL, LOG_LEVEL] }\n";
    expect(run(b, a, policy)).toEqual([]);
  });
  it("does nothing without a policy, and ignores variables never declared", () => {
    const b = "services:\n  api: { image: x, environment: [DB_URL=a] }\n";
    const a = "services:\n  api: { image: x }\n";
    expect(run(b, a)).toEqual([]);
    expect(run("services:\n  api: { image: x }\n", a, policy)).toEqual([]);
  });
  it("never puts environment values in the report", () => {
    const b = "services:\n  api: { image: x, environment: { DB_URL: 'postgres://u:topsecretpw@h/db' } }\n";
    const a = "services:\n  api: { image: x }\n";
    const f = run(b, a, { requiredEnv: { api: ["DB_URL"] } });
    expect(JSON.stringify(f)).not.toContain("topsecretpw");
  });
});
