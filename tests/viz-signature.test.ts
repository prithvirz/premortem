import { describe, expect, it } from "vitest";
import { analyze } from "@/lib/compose/analyze";
import { SCENARIOS } from "@/lib/examples/scenarios";
import { buildGraphModel } from "@/lib/viz/graph";
import { buildHeadline } from "@/lib/viz/headline";
import { highlightFor } from "@/lib/viz/highlight";
import { buildTimeline } from "@/lib/viz/timeline";
import { edgeSpec, nodeBadges, severityVisual } from "@/lib/viz/visuals";
import { viewGraph } from "@/lib/viz/view";

function build(before: string, after: string, policy?: (typeof SCENARIOS)[number]["policy"]) {
  const r = analyze({ before, after, policy });
  if (!r.ok) throw new Error(JSON.stringify(r.diagnostics));
  const model = buildGraphModel(r.models.before, r.models.after, r.diff, r.findings);
  return { r, model };
}
const scenario = (id: string) => {
  const s = SCENARIOS.find((x) => x.id === id)!;
  return build(s.before, s.after, s.policy);
};
const net = (model: ReturnType<typeof build>["model"], label: string) => model.nodes.find((n) => n.kind === "network" && n.label.startsWith(label))!.id;

describe("verdict headline", () => {
  it("names services for each scenario", () => {
    expect(buildHeadline(scenario("severed-cache").r.findings)).toMatchObject({
      text: "api → redis: shared network lost",
      qualifier: "Possible runtime impact, inferred from configuration",
      more: 0,
    });
    expect(buildHeadline(scenario("renamed-database").r.findings)).toMatchObject({
      text: "app, worker → postgres: target service missing",
      qualifier: "Compose is expected to reject the AFTER file",
      more: 0,
    });
    expect(buildHeadline(scenario("quiet-config-drift").r.findings)).toMatchObject({
      text: "api: required JWT_SECRET no longer declared",
      qualifier: "Required by your policy",
      more: 4,
    });
  });
  it("ignores info-only findings and returns null when there is nothing to report", () => {
    const y = "services:\n  a: { image: x }\n";
    expect(buildHeadline(build(y, y).r.findings)).toBeNull();
    const iso = build("services:\n  a: { image: x }\n  b: { image: y }\n", "services:\n  a: { image: x, networks: [n] }\n  b: { image: y }\nnetworks: { n: {} }\n");
    expect(iso.r.findings.every((f) => f.severity === "info")).toBe(true);
    expect(buildHeadline(iso.r.findings)).toBeNull();
  });
  it("never states an inferred effect as certain", () => {
    for (const s of SCENARIOS) {
      const h = buildHeadline(build(s.before, s.after, s.policy).r.findings)!;
      expect(h.text).not.toMatch(/\b(will|fails|failed|down|crash)\b/i);
    }
  });
});

describe("network tags replace membership curves", () => {
  it("severed cache: tags show kept, added, and removed networks per view", () => {
    const { model } = scenario("severed-cache");
    const tags = (mode: "before" | "after" | "diff", svc: string) =>
      viewGraph(model, mode).nodes.find((n) => n.label === svc)!.networks.map((t) => `${t.state}:${t.label}`);
    expect(tags("before", "redis")).toEqual(["kept:default"]);
    expect(tags("after", "redis")).toEqual(["added:cache"]);
    expect(tags("diff", "redis")).toEqual(["added:cache", "removed:default"]);
    expect(tags("diff", "api")).toEqual(["added:backend", "added:frontend", "removed:default"]);
  });
  it("labels network_mode instead of inventing memberships", () => {
    const { model } = build("services:\n  a: { image: x }\n  vpn: { image: y }\n", "services:\n  a: { image: x, network_mode: 'service:vpn' }\n  vpn: { image: y }\n");
    const a = viewGraph(model, "after").nodes.find((n) => n.label === "a")!;
    expect(a.networks).toEqual([]);
    expect(a.networkModeLabel).toBe("shares network of vpn");
    expect(model.nodes.find((n) => n.label === "a")!.changeKinds).toContain("networks");
  });
  it("a removed service keeps its previous networks as its ghost state", () => {
    const { model } = scenario("renamed-database");
    const pg = viewGraph(model, "diff").nodes.find((n) => n.label === "postgres")!;
    expect(pg.networks.map((t) => t.state)).toEqual(["kept"]);
    const db = viewGraph(model, "diff").nodes.find((n) => n.label === "database")!;
    expect(db.networks.map((t) => t.state)).toEqual(["kept"]);
  });
});

describe("network-aware highlighting", () => {
  it("selecting the network-lost finding lights both services and the lost network, not unrelated services", () => {
    const { r, model } = scenario("severed-cache");
    const h = highlightFor(model, r.findings, { kind: "finding", id: "network-lost:api:redis" }, null)!;
    expect(h.ids.has("svc:api")).toBe(true);
    expect(h.ids.has("svc:redis")).toBe(true);
    expect(h.ids.has("e:depends_on:api->redis")).toBe(true);
    expect(h.ids.has("svc:web")).toBe(false);
    expect(h.ids.has("svc:db")).toBe(false);
    expect(h.networks.get(net(model, "default"))).toBe("lost");
    expect(h.networks.get(net(model, "cache"))).toBe("related");
    expect(h.networks.get(net(model, "backend"))).toBe("related");
  });
  it("the timeline step for that finding gives the same network emphasis", () => {
    const { r, model } = scenario("severed-cache");
    const step = buildTimeline(model, r.diff, r.findings).find((s) => s.findingId === "network-lost:api:redis")!;
    expect(highlightFor(model, r.findings, null, step)!.networks.get(net(model, "default"))).toBe("lost");
  });
  it("selecting the broken edge pulls in its finding's networks", () => {
    const { r, model } = scenario("severed-cache");
    const h = highlightFor(model, r.findings, { kind: "edge", id: "e:depends_on:api->redis" }, null)!;
    expect(h.networks.get(net(model, "default"))).toBe("lost");
  });
  it("non-network findings do not emphasize networks", () => {
    const { r, model } = scenario("renamed-database");
    const h = highlightFor(model, r.findings, { kind: "finding", id: "dependency-dangling:app:postgres:depends_on" }, null)!;
    expect(h.networks.size).toBe(0);
    expect([...h.ids].sort()).toEqual(["e:depends_on:app->postgres", "svc:app", "svc:postgres"]);
  });
  it("selecting a network lights its members in either version", () => {
    const { r, model } = scenario("severed-cache");
    const h = highlightFor(model, r.findings, { kind: "node", id: net(model, "cache") }, null)!;
    expect([...h.ids]).toEqual(["svc:redis"]);
  });
  it("no selection means no dimming", () => {
    const { r, model } = scenario("severed-cache");
    expect(highlightFor(model, r.findings, null, null)).toBeNull();
  });
});

describe("visual mapping (signature)", () => {
  it("shows specific change labels rather than a generic Changed", () => {
    const { model } = scenario("quiet-config-drift");
    const api = viewGraph(model, "diff").nodes.find((n) => n.label === "api")!;
    const texts = nodeBadges(api.visual, api.risk, false, false, api.changeKinds).map((b) => b.text);
    expect(texts).toContain("Ports changed");
    expect(texts).toContain("Env keys changed");
    expect(texts).not.toContain("Changed");
  });
  it("severity badges use the canonical severity color", () => {
    const b = nodeBadges("steady", "critical", false, false).find((x) => x.tone === "severity")!;
    expect(b.color).toBe(severityVisual("critical").color);
    expect(b.color).toBe("#ff4d5e");
  });
  it("broken edges are severed (gap), not just dashed; inferred at-risk edges are not severed", () => {
    expect(edgeSpec("broken", "depends_on").severed).toBe(true);
    expect(edgeSpec("at-risk", "depends_on").severed).toBeFalsy();
    expect(edgeSpec("isolated", "lost-network").severed).toBeFalsy();
  });
  it("ghost and added states are distinct", () => {
    expect(nodeBadges("removed", undefined, false, false)[0]).toMatchObject({ text: "Ghost of BEFORE", tone: "remove" });
    expect(nodeBadges("added", undefined, false, false)[0]).toMatchObject({ tone: "add" });
  });
});
