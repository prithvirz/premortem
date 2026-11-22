import { describe, expect, it } from "vitest";
import { analyze } from "@/lib/compose/analyze";
import { SCENARIOS } from "@/lib/examples/scenarios";
import { buildGraphModel, type ViewMode } from "@/lib/viz/graph";
import { summarize } from "@/lib/viz/summary";
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
  return { s, ...build(s.before, s.after, s.policy) };
};
const MODES: ViewMode[] = ["before", "after", "diff"];

describe("graph model: scenarios", () => {
  it("severed cache: the api->redis dependency is broken in AFTER with a precise label", () => {
    const { model } = scenario("severed-cache");
    const e = model.edges.find((x) => x.id === "e:depends_on:api->redis")!;
    expect(e.risk).toBe("broken");
    expect(e.riskLabel).toBe("no shared network");
    expect(e.findingIds).toEqual(["network-lost:api:redis"]);
    expect(viewGraph(model, "after").edges.find((x) => x.id === e.id)!.visual).toBe("broken");
    expect(viewGraph(model, "before").edges.find((x) => x.id === e.id)!.visual).toBe("steady");
  });

  it("severed cache: unrelated isolation becomes faint isolated edges, never broken or at-risk", () => {
    const { model } = scenario("severed-cache");
    const lost = model.edges.filter((e) => e.kind === "lost-network");
    expect(lost.length).toBeGreaterThan(0);
    for (const e of lost) {
      expect(e.risk).toBe("isolated");
      expect(e.presence).toEqual({ before: false, after: true });
    }
  });

  it("severed cache: the implicit default network exists only in BEFORE; new tiers only in AFTER", () => {
    const { model } = scenario("severed-cache");
    const net = (label: string) => model.nodes.find((n) => n.kind === "network" && n.label === label)!;
    expect(net("default (implicit)")).toMatchObject({ inBefore: true, inAfter: false, implicit: true });
    expect(net("cache")).toMatchObject({ inBefore: false, inAfter: true });
    expect(viewGraph(model, "before").nodes.some((n) => n.label === "cache")).toBe(false);
    expect(viewGraph(model, "after").nodes.some((n) => n.label === "default (implicit)")).toBe(false);
  });

  it("renamed database: removed service is a 'missing' ghost in AFTER, removed in BEFORE/diff, and the edge is broken", () => {
    const { model } = scenario("renamed-database");
    const find = (mode: ViewMode, label: string) => viewGraph(model, mode).nodes.find((n) => n.label === label);
    expect(find("after", "postgres")).toMatchObject({ visual: "missing", danglingTarget: true });
    expect(find("diff", "postgres")).toMatchObject({ visual: "removed", danglingTarget: true });
    expect(find("before", "postgres")).toMatchObject({ visual: "removed" });
    expect(find("after", "database")?.visual).toBe("added");
    const broken = viewGraph(model, "after").edges.filter((e) => e.visual === "broken");
    expect(broken.map((e) => e.id).sort()).toEqual(["e:depends_on:app->postgres", "e:depends_on:worker->postgres"]);
    expect(broken.every((e) => e.label === "target service missing")).toBe(true);
  });

  it("config drift: port and policy findings badge nodes but draw no broken edges", () => {
    const { model } = scenario("quiet-config-drift");
    const after = viewGraph(model, "after");
    expect(after.edges.filter((e) => e.visual === "broken" || e.visual === "at-risk")).toEqual([]);
    expect(after.nodes.find((n) => n.label === "api")).toMatchObject({ risk: "high", visual: "changed" });
    expect(viewGraph(model, "before").nodes.every((n) => n.risk === undefined)).toBe(true);
  });
});

describe("graph model: invariants", () => {
  it("keeps identical node positions across all three views", () => {
    for (const s of SCENARIOS) {
      const { model } = build(s.before, s.after, s.policy);
      const pos = new Map(model.nodes.map((n) => [n.id, JSON.stringify(n.position)]));
      for (const mode of MODES) {
        for (const n of viewGraph(model, mode).nodes) expect(JSON.stringify(n.position)).toBe(pos.get(n.id));
      }
    }
  });

  it("is deterministic and positions never overlap among service nodes", () => {
    for (const s of SCENARIOS) {
      const a = build(s.before, s.after, s.policy).model;
      const b = build(s.before, s.after, s.policy).model;
      expect(JSON.stringify(a)).toBe(JSON.stringify(b));
      const svcs = a.nodes.filter((n) => n.kind === "service");
      for (const x of svcs) {
        for (const y of svcs) {
          if (x.id >= y.id) continue;
          const apart = Math.abs(x.position.x - y.position.x) >= 220 || Math.abs(x.position.y - y.position.y) >= 150;
          expect(apart).toBe(true);
        }
      }
    }
  });

  it("every edge endpoint exists as a node in every view", () => {
    for (const s of SCENARIOS) {
      const { model } = build(s.before, s.after, s.policy);
      for (const mode of MODES) {
        const v = viewGraph(model, mode);
        const ids = new Set(v.nodes.map((n) => n.id));
        for (const e of v.edges) {
          expect(ids.has(e.source)).toBe(true);
          expect(ids.has(e.target)).toBe(true);
        }
      }
    }
  });

  it("never marks risk in the BEFORE view", () => {
    for (const s of SCENARIOS) {
      const { model } = build(s.before, s.after, s.policy);
      const v = viewGraph(model, "before");
      expect(v.edges.some((e) => e.visual === "broken" || e.visual === "at-risk")).toBe(false);
    }
  });

  it("marks unsupported features as unresolved on the node", () => {
    const { model } = build(
      "services:\n  a: { image: x }\n",
      'services:\n  a:\n    image: x\n    extends: { service: base }\n    ports: ["${P}:80"]\n',
    );
    const a = model.nodes.find((n) => n.label === "a")!;
    expect(a.unknowns.join(" ")).toMatch(/extends/);
    expect(a.unknowns.join(" ")).toMatch(/interpolation/);
    expect(nodeBadges("steady", undefined, a.unknowns.length > 0, false).some((b) => b.tone === "unknown")).toBe(true);
  });

  it("handles a never-defined reference as a ghost node", () => {
    const { model } = build("services:\n  a: { image: x }\n", "services:\n  a: { image: x, depends_on: [typo] }\n");
    expect(viewGraph(model, "after").nodes.find((n) => n.label === "typo")?.visual).toBe("missing");
    expect(viewGraph(model, "before").nodes.some((n) => n.label === "typo")).toBe(false);
  });

  it("identical files produce no risk and no changed nodes", () => {
    const y = "services:\n  a: { image: x, depends_on: [b] }\n  b: { image: y }\n";
    const { model } = build(y, y);
    expect(model.edges.every((e) => !e.risk)).toBe(true);
    expect(model.nodes.every((n) => !n.changed && !n.severity)).toBe(true);
  });
});

describe("finding-to-visual mapping", () => {
  it("uses a distinct glyph and label per severity (not color alone)", () => {
    const sevs = ["critical", "high", "medium", "low", "info"] as const;
    expect(new Set(sevs.map((s) => severityVisual(s).glyph)).size).toBe(5);
    expect(new Set(sevs.map((s) => severityVisual(s).label)).size).toBe(5);
  });
  it("gives each edge state a distinct stroke style", () => {
    const states = ["steady", "added", "removed", "broken", "at-risk", "isolated"] as const;
    const sig = states.map((s) => JSON.stringify(edgeSpec(s, "depends_on")));
    expect(new Set(sig).size).toBe(6);
    expect(edgeSpec("broken", "depends_on").dash).not.toBe(edgeSpec("at-risk", "depends_on").dash);
    expect(edgeSpec("broken", "depends_on").stroke).toBe("#ff4d5e");
  });
  it("badges risk nodes with text, including danglingTarget wording", () => {
    expect(nodeBadges("removed", undefined, false, true)[0]!.text).toBe("Removed, still referenced");
    expect(nodeBadges("steady", "critical", false, false)[0]!.text).toContain("Critical");
    expect(nodeBadges("steady", "info", false, false)).toEqual([]);
  });
});

describe("timeline and summary", () => {
  it.each(SCENARIOS)("$name: every finding has a step, changes come first, ids resolve", (s) => {
    const { r, model } = build(s.before, s.after, s.policy);
    const steps = buildTimeline(model, r.diff, r.findings);
    const lastChange = steps.map((x) => x.phase).lastIndexOf("change");
    const firstConsequence = steps.map((x) => x.phase).indexOf("consequence");
    if (lastChange !== -1 && firstConsequence !== -1) expect(lastChange).toBeLessThan(firstConsequence);
    expect(steps.filter((x) => x.findingId).map((x) => x.findingId).sort()).toEqual(r.findings.map((f) => f.id).sort());
    const nodeIds = new Set(model.nodes.map((n) => n.id));
    const edgeIds = new Set(model.edges.map((e) => e.id));
    const findingIds = new Set(r.findings.map((f) => f.id));
    for (const st of steps) {
      expect(st.evidence.length).toBeGreaterThan(0);
      st.nodeIds.forEach((id) => expect(nodeIds.has(id)).toBe(true));
      st.edgeIds.forEach((id) => expect(edgeIds.has(id)).toBe(true));
      st.relatedFindingIds.forEach((id) => expect(findingIds.has(id)).toBe(true));
    }
  });

  it("renamed database: the removal step points at the dangling findings", () => {
    const { r, model } = scenario("renamed-database");
    const step = buildTimeline(model, r.diff, r.findings).find((x) => x.id === "change:removed:postgres")!;
    expect(step.relatedFindingIds.sort()).toEqual(["dependency-dangling:app:postgres:depends_on", "dependency-dangling:worker:postgres:depends_on"]);
  });

  it("summary numbers match the engine output and contain no invented statistics", () => {
    const { r } = scenario("quiet-config-drift");
    const sum = summarize(r);
    expect(sum.total).toBe(5);
    expect(sum.counts).toEqual({ critical: 0, high: 1, medium: 4, low: 0, info: 0 });
    expect(sum.policyFindings).toBe(2);
    expect(sum.inferred).toBe(3);
    expect(sum.validationFailures).toBe(0);
    expect(sum.affectedRelationships).toBe(0);
    expect(summarize(scenario("severed-cache").r).affectedRelationships).toBe(1);
    const rd = summarize(scenario("renamed-database").r);
    expect(rd.validationFailures).toBe(2);
    expect(rd.changes).toMatchObject({ servicesAdded: 1, servicesRemoved: 1 });
  });

  it("surfaces diagnostics warnings as unknowns", () => {
    const { r } = build("services:\n  a: { image: x }\n", "include: [x.yml]\nservices:\n  a: { image: x }\n");
    expect(summarize(r).unknowns.join(" ")).toMatch(/include/);
  });
});
