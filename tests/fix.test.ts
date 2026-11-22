import { describe, expect, it } from "vitest";
import { analyze } from "@/lib/compose/analyze";
import { SCENARIOS } from "@/lib/examples/scenarios";
import { attachNetwork, retargetDependency } from "@/lib/fix/patch";
import { previewFix, lineDiff } from "@/lib/fix/preview";
import { proposeFix, type FixOffer } from "@/lib/fix/proposals";
import { buildGraphModel } from "@/lib/viz/graph";
import { previewGraph } from "@/lib/viz/preview-view";

const scenario = (id: string) => SCENARIOS.find((s) => s.id === id)!;

function ok(before: string, after: string, policy?: (typeof SCENARIOS)[number]["policy"]) {
  const r = analyze({ before, after, policy });
  if (!r.ok) throw new Error(JSON.stringify(r.diagnostics));
  return r;
}
function offerFor(before: string, after: string, findingId: string, policy?: (typeof SCENARIOS)[number]["policy"]): FixOffer {
  const r = ok(before, after, policy);
  const f = r.findings.find((x) => x.id === findingId);
  if (!f) throw new Error(`no finding ${findingId}: ${r.findings.map((x) => x.id).join(", ")}`);
  return proposeFix(f, r.models.before, r.models.after, after);
}
const changedLines = (a: string, b: string) => lineDiff(a, b, 0).filter((l) => l.kind === "add" || l.kind === "del");

describe("attachNetwork: minimal, verified edits", () => {
  it("appends to a flow list and changes exactly one line", () => {
    const t = "services:\n  api:\n    image: x   # keep me\n    networks: [frontend, backend]\nnetworks: { frontend: {}, backend: {}, cache: {} }\n";
    const r = attachNetwork(t, "api", "cache");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.text).toBe(t.replace("[frontend, backend]", "[frontend, backend, cache]"));
  });
  it("appends to a block list, keeping comments and indentation", () => {
    const t = "# head\nservices:\n  api:\n    networks:\n      - a   # first\n      - b\n    image: x\nnetworks:\n  a:\n  b:\n  c:\n";
    const r = attachNetwork(t, "api", "c");
    expect(r.ok && r.text).toBe("# head\nservices:\n  api:\n    networks:\n      - a   # first\n      - b\n      - c\n    image: x\nnetworks:\n  a:\n  b:\n  c:\n");
  });
  it("adds to a networks map (block) without touching existing attachment config", () => {
    const t = "services:\n  api:\n    networks:\n      a:\n        aliases: [api-a]\n    image: x\nnetworks:\n  a:\n  c:\n";
    const r = attachNetwork(t, "api", "c");
    expect(r.ok && r.text).toBe("services:\n  api:\n    networks:\n      a:\n        aliases: [api-a]\n      c:\n    image: x\nnetworks:\n  a:\n  c:\n");
  });
  it("keeps the implicit default when the service had no networks key", () => {
    const t = "services:\n  api:\n    image: x\n    ports:\n      - \"80:80\"\nnetworks:\n  c:\n";
    const r = attachNetwork(t, "api", "c");
    expect(r.ok && r.text).toBe("services:\n  api:\n    image: x\n    ports:\n      - \"80:80\"\n    networks: [default, c]\nnetworks:\n  c:\n");
  });
  it("handles flow-style service definitions", () => {
    const t = "services:\n  api: { image: x, networks: [a] }\nnetworks: { a: {}, c: {} }\n";
    expect(attachNetwork(t, "api", "c")).toMatchObject({ ok: true, text: "services:\n  api: { image: x, networks: [a, c] }\nnetworks: { a: {}, c: {} }\n" });
  });
  it("preserves CRLF line endings", () => {
    const t = "services:\r\n  api:\r\n    networks:\r\n      - a\r\nnetworks:\r\n  a:\r\n  c:\r\n";
    const r = attachNetwork(t, "api", "c");
    expect(r.ok && r.text).toBe("services:\r\n  api:\r\n    networks:\r\n      - a\r\n      - c\r\nnetworks:\r\n  a:\r\n  c:\r\n");
  });

  it.each([
    ["include", "include: [x.yml]\nservices:\n  api: { image: x, networks: [a] }\nnetworks: { a: {}, c: {} }\n", /include/],
    ["merge key", "x: &b { image: x }\nservices:\n  api:\n    <<: *b\n    networks: [a]\nnetworks: { a: {}, c: {} }\n", /merge key/],
    ["service alias", "x: &s { image: x, networks: [a] }\nservices:\n  api: *s\nnetworks: { a: {}, c: {} }\n", /alias/],
    ["service anchor", "services:\n  api: &s { image: x, networks: [a] }\n  b: *s\nnetworks: { a: {}, c: {} }\n", /anchor/],
    ["networks alias", "x: &n [a]\nservices:\n  api: { image: x, networks: *n }\nnetworks: { a: {}, c: {} }\n", /alias/],
    ["interpolation", "services:\n  api: { image: x, networks: [\"${NET}\"] }\nnetworks: { a: {}, c: {} }\n", /interpolation/],
    ["extends", "services:\n  api: { extends: { service: b }, networks: [a] }\nnetworks: { a: {}, c: {} }\n", /extends/],
    ["network_mode", "services:\n  api: { image: x, network_mode: host }\nnetworks: { c: {} }\n", /network_mode/],
    ["undeclared network", "services:\n  api: { image: x, networks: [a] }\nnetworks: { a: {} }\n", /not declared/],
    ["multiple documents", "services:\n  api: { image: x }\n---\nservices: {}\n", /more than one/],
  ])("declines when the file uses %s", (_n, t, why) => {
    const r = attachNetwork(t, "api", "c");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(why);
  });

  it("never changes lines outside the edit, including secrets", () => {
    const t = "services:\n  api:\n    image: x\n    environment:\n      DB_URL: postgres://u:hunter2@db/app\n    networks: [a]\nnetworks: { a: {}, c: {} }\n";
    const r = attachNetwork(t, "api", "c");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const changed = changedLines(t, r.text);
    expect(changed.map((l) => l.text)).toEqual(["    networks: [a]", "    networks: [a, c]"]);
  });
});

describe("retargetDependency", () => {
  it("renames list entries and map keys, keeping conditions and quoting", () => {
    const t = 'services:\n  app:\n    depends_on:\n      - "postgres"   # db\n  worker:\n    depends_on:\n      postgres:\n        condition: service_healthy\n  database:\n    image: postgres:16\n';
    const r = retargetDependency(t, ["app", "worker"], "postgres", "database");
    expect(r.ok && r.text).toBe(t.replace('- "postgres"', '- "database"').replace("      postgres:\n", "      database:\n"));
  });
  it("keeps the old name as a links alias", () => {
    const t = "services:\n  app: { image: x, links: [postgres] }\n  database: { image: y }\n";
    expect(retargetDependency(t, ["app"], "postgres", "database")).toMatchObject({ ok: true, text: "services:\n  app: { image: x, links: [database:postgres] }\n  database: { image: y }\n" });
  });
  it("declines duplicates, network_mode references, and a missing target", () => {
    const dup = "services:\n  app: { image: x, depends_on: [postgres, database] }\n  database: { image: y }\n";
    expect(retargetDependency(dup, ["app"], "postgres", "database")).toMatchObject({ ok: false, reason: expect.stringMatching(/already depends/) });
    const nm = "services:\n  app: { image: x, depends_on: [postgres], network_mode: 'service:postgres' }\n  database: { image: y }\n";
    expect(retargetDependency(nm, ["app"], "postgres", "database")).toMatchObject({ ok: false, reason: expect.stringMatching(/network_mode/) });
    expect(retargetDependency("services:\n  app: { depends_on: [postgres] }\n", ["app"], "postgres", "database")).toMatchObject({ ok: false });
  });
});

describe("proposeFix: eligibility", () => {
  it("severed cache: offers attaching api to cache first, with an isolation disclosure", () => {
    const s = scenario("severed-cache");
    const offer = offerFor(s.before, s.after, "network-lost:api:redis");
    expect(offer.eligible).toBe(true);
    if (!offer.eligible) return;
    expect(offer.options[0]).toMatchObject({ id: "attach:api:cache", recommended: true });
    expect(offer.options[0]!.changes).toEqual([{ service: "api", path: "services.api.networks", before: "[frontend, backend]", after: "[frontend, backend, cache]" }]);
    expect(offer.options[0]!.disclosures.join(" ")).toMatch(/isolation/);
    expect(offer.options.map((o) => o.id)).toEqual(["attach:api:cache", "attach:redis:frontend", "attach:redis:backend"]);
  });
  it("does not offer reconnection for undeclared or intentionally removed relationships", () => {
    const s = scenario("severed-cache");
    expect(offerFor(s.before, s.after, "network-lost:db:*")).toMatchObject({ eligible: false, reason: expect.stringMatching(/intentional/) });
    const removed = offerFor("services:\n  a: { image: x, depends_on: [b] }\n  b: { image: y }\n", "services:\n  a: { image: x, networks: [n] }\n  b: { image: y }\nnetworks: { n: {} }\n", "network-lost:a:b");
    expect(removed).toMatchObject({ eligible: false, reason: expect.stringMatching(/intentional/) });
  });
  it("renamed database: offers database as the confirmed-only replacement for both services", () => {
    const s = scenario("renamed-database");
    const offer = offerFor(s.before, s.after, "dependency-dangling:app:postgres:depends_on");
    expect(offer.eligible).toBe(true);
    if (!offer.eligible) return;
    const o = offer.options[0]!;
    expect(o).toMatchObject({ id: "retarget:postgres:database", recommended: true });
    expect(o.confirmation).toMatch(/I have checked that "database" replaces "postgres"/);
    expect(o.disclosures.join(" ")).toMatch(/hint, not proof/);
    expect(o.changes.map((c) => c.service)).toEqual(["app", "worker"]);
    expect(o.warnings).toEqual([]);
  });
  it("declines a rename without a plausible candidate", () => {
    const offer = offerFor("services:\n  a: { image: x, depends_on: [db] }\n  db: { image: postgres }\n", "services:\n  a: { image: x, depends_on: [db] }\n  cache: { image: redis }\n", "dependency-dangling:a:db:depends_on");
    expect(offer).toMatchObject({ eligible: false, reason: expect.stringMatching(/No service added in AFTER/) });
  });
  it("lists every candidate when the match is ambiguous, recommending none", () => {
    const offer = offerFor(
      "services:\n  a: { image: x, depends_on: [db] }\n  db: { image: postgres }\n",
      "services:\n  a: { image: x, depends_on: [db] }\n  db1: { image: postgres }\n  db2: { image: postgres }\n",
      "dependency-dangling:a:db:depends_on",
    );
    expect(offer.eligible).toBe(true);
    if (offer.eligible) expect(offer.options.map((o) => [o.id, o.recommended])).toEqual([["retarget:db:db1", false], ["retarget:db:db2", false]]);
  });
  it("declines when the AFTER file cannot be edited safely", () => {
    const s = scenario("severed-cache");
    const after = `include: [more.yml]\n${s.after}`;
    expect(offerFor(s.before, after, "network-lost:api:redis")).toMatchObject({ eligible: false, reason: expect.stringMatching(/include/) });
  });
  it("never offers to invent values for policy or port findings", () => {
    const s = scenario("quiet-config-drift");
    const r = ok(s.before, s.after, s.policy);
    for (const f of r.findings) expect(proposeFix(f, r.models.before, r.models.after, s.after).eligible).toBe(false);
  });
});

describe("previewFix: isolation and reanalysis", () => {
  it("severed cache: the engine clears exactly the target finding", () => {
    const s = scenario("severed-cache");
    const input = { before: s.before, after: s.after };
    const r = ok(s.before, s.after);
    const snapshot = JSON.stringify(input);
    const offer = proposeFix(r.findings.find((f) => f.id === "network-lost:api:redis")!, r.models.before, r.models.after, s.after);
    if (!offer.eligible) throw new Error("not eligible");
    const p = previewFix(input, r, offer.findingId, offer.options[0]!);
    if ("error" in p) throw new Error(p.error);
    expect(JSON.stringify(input)).toBe(snapshot); // inputs untouched
    expect(p.targetCleared).toBe(true);
    expect(p.cleared.map((f) => f.id)).toEqual(["network-lost:api:redis"]);
    expect(p.introduced).toEqual([]);
    expect(p.verdict).toBe("Configuration warning cleared after reanalysis.");
    expect(p.diff.filter((l) => l.kind !== "same" && l.kind !== "gap").map((l) => `${l.kind} ${l.text.trim()}`)).toEqual([
      "del networks: [frontend, backend]",
      "add networks: [frontend, backend, cache]",
    ]);
  });
  it("renamed database: both missing-service findings clear and nothing new appears", () => {
    const s = scenario("renamed-database");
    const r = ok(s.before, s.after);
    const f = r.findings[0]!;
    const offer = proposeFix(f, r.models.before, r.models.after, s.after);
    if (!offer.eligible) throw new Error("not eligible");
    const p = previewFix({ before: s.before, after: s.after }, r, f.id, offer.options[0]!);
    if ("error" in p) throw new Error(p.error);
    expect(p.cleared.map((x) => x.id).sort()).toEqual(["dependency-dangling:app:postgres:depends_on", "dependency-dangling:worker:postgres:depends_on"]);
    expect(p.report.findings).toEqual([]);
    expect(p.verdict).toBe("Configuration warning cleared after reanalysis.");
  });
  it("M3.1: renaming to a database on another network clears the missing service and surfaces a new risk", () => {
    const before = "services:\n  app:\n    image: acme/app\n    depends_on: [postgres]\n  postgres:\n    image: postgres:16\n";
    const after = "services:\n  app:\n    image: acme/app\n    depends_on: [postgres]\n  database:\n    image: postgres:16\n    networks: [data]\nnetworks:\n  data:\n";
    const r = ok(before, after);
    expect(r.findings.map((f) => f.id)).toEqual(["dependency-dangling:app:postgres:depends_on"]);
    const f = r.findings[0]!;
    const offer = proposeFix(f, r.models.before, r.models.after, after);
    if (!offer.eligible) throw new Error("not eligible");
    const snapshot = after;
    const p = previewFix({ before, after }, r, f.id, offer.options[0]!);
    if ("error" in p) throw new Error(p.error);
    expect(after).toBe(snapshot);
    expect(p.targetCleared).toBe(true);
    expect(p.cleared.map((x) => x.id)).toEqual(["dependency-dangling:app:postgres:depends_on"]);
    expect(p.introduced.map((x) => [x.id, x.severity, x.basis])).toEqual([["dependency-unreachable:app:database:depends_on", "medium", "inferred"]]);
    expect(p.newRisk).toBe(true);
    expect(p.verdict).toBe("Configuration warning cleared after reanalysis, but 1 new risk detected.");
    expect(p.tally).toBe("1 resolved · 1 new risk · 0 other risks still reported");
    expect(JSON.stringify(p.verdict + p.tally)).not.toMatch(/fixed|safe to deploy|all clear/i);
  });  it("says the warning remains when the engine still reports it", () => {
    const s = scenario("severed-cache");
    const r = ok(s.before, s.after);
    const f = r.findings.find((x) => x.id === "network-lost:api:redis")!;
    const fake = { id: "noop", kind: "attach-network" as const, label: "", recommended: false, changes: [], disclosures: [], warnings: [], patchedAfter: s.after };
    const p = previewFix({ before: s.before, after: s.after }, r, f.id, fake);
    if ("error" in p) throw new Error(p.error);
    expect(p.targetCleared).toBe(false);
    expect(p.verdict).toMatch(/remains/);
  });
  it("never uses certainty language", () => {
    for (const id of ["severed-cache", "renamed-database"]) {
      const s = scenario(id);
      const r = ok(s.before, s.after);
      const f = r.findings.find((x) => x.severity !== "info")!;
      const offer = proposeFix(f, r.models.before, r.models.after, s.after);
      if (!offer.eligible) throw new Error("not eligible");
      const p = previewFix({ before: s.before, after: s.after }, r, f.id, offer.options[0]!);
      const text = JSON.stringify([offer, "error" in p ? p : { v: p.verdict }]);
      expect(text).not.toMatch(/deployment (is )?fixed|safe to deploy|will work/i);
    }
  });
  it("redacts secrets in the line diff", () => {
    const a = "services:\n  api:\n    environment: [TOKEN=abc123secret]\n    networks: [a]\n";
    const b = "services:\n  api:\n    environment: [TOKEN=zzz999secret]\n    networks: [a, c]\n";
    const text = JSON.stringify(lineDiff(a, b));
    expect(text).not.toContain("abc123secret");
    expect(text).not.toContain("zzz999secret");
  });
});

describe("previewGraph", () => {
  it("severed cache: the api->redis edge is restored and the cache tag is marked proposed", () => {
    const s = scenario("severed-cache");
    const r = ok(s.before, s.after);
    const offer = proposeFix(r.findings.find((f) => f.id === "network-lost:api:redis")!, r.models.before, r.models.after, s.after);
    if (!offer.eligible) throw new Error("not eligible");
    const p = previewFix({ before: s.before, after: s.after }, r, offer.findingId, offer.options[0]!);
    if ("error" in p) throw new Error(p.error);
    const cur = buildGraphModel(r.models.before, r.models.after, r.diff, r.findings);
    const prop = buildGraphModel(p.report.models.before, p.report.models.after, p.report.diff, p.report.findings);
    const g = previewGraph(cur, prop);
    expect(g.restoredEdgeIds).toEqual(["e:depends_on:api->redis"]);
    const api = g.view.nodes.find((n) => n.id === "svc:api")!;
    expect(api.networks.find((t) => t.label === "cache")?.state).toBe("proposed");
    const pos = new Map(cur.nodes.map((n) => [n.id, n.position]));
    for (const n of g.view.nodes) if (pos.has(n.id)) expect(n.position).toEqual(pos.get(n.id));
  });
  it("renamed database: new edges to database count as reconnected; the ghost disappears", () => {
    const s = scenario("renamed-database");
    const r = ok(s.before, s.after);
    const offer = proposeFix(r.findings[0]!, r.models.before, r.models.after, s.after);
    if (!offer.eligible) throw new Error("not eligible");
    const p = previewFix({ before: s.before, after: s.after }, r, offer.findingId, offer.options[0]!);
    if ("error" in p) throw new Error(p.error);
    const g = previewGraph(buildGraphModel(r.models.before, r.models.after, r.diff, r.findings), buildGraphModel(p.report.models.before, p.report.models.after, p.report.diff, p.report.findings));
    expect(g.restoredEdgeIds.sort()).toEqual(["e:depends_on:app->database", "e:depends_on:worker->database"]);
    expect(g.view.nodes.some((n) => n.id === "svc:postgres")).toBe(false);
    const cur = buildGraphModel(r.models.before, r.models.after, r.diff, r.findings);
    const t = previewGraph(cur, buildGraphModel(p.report.models.before, p.report.models.after, p.report.diff, p.report.findings), { from: "svc:postgres", to: "svc:database" });
    expect(t.view.nodes.find((n) => n.id === "svc:database")!.position).toEqual(cur.nodes.find((n) => n.id === "svc:postgres")!.position);
  });
});
