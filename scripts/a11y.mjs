// Automated accessibility audit (axe-core, WCAG 2.1 A/AA) across key UI states.
// Run against a running server: node scripts/a11y.mjs [baseUrl]
// This is automated checking only; it does not replace testing with a real screen reader.
import { chromium } from "playwright-core";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const axePath = require.resolve("axe-core/axe.min.js");
const base = process.argv[2] ?? "http://localhost:3200";
const browser = await chromium.launch({ channel: process.env.PM_BROWSER_CHANNEL ?? "msedge", headless: true });

const states = [
  ["desktop: default", { w: 1440, h: 1000 }, async () => {}],
  ["desktop: finding selected", { w: 1440, h: 1000 }, async (p) => p.getByRole("button", { name: /Top risk/ }).click()],
  [
    "desktop: fix preview",
    { w: 1440, h: 1000 },
    async (p) => {
      await p.getByRole("button", { name: /Top risk/ }).click();
      await p.getByTestId("fix-panel").getByRole("button", { name: "Preview possible fix" }).click();
    },
  ],
  [
    "desktop: apply confirmation",
    { w: 1440, h: 1000 },
    async (p) => {
      await p.getByRole("button", { name: /Top risk/ }).click();
      await p.getByTestId("fix-panel").getByRole("button", { name: "Preview possible fix" }).click();
      await p.getByRole("button", { name: "Apply to AFTER editor…" }).click();
    },
  ],
  ["desktop: editors open", { w: 1440, h: 1000 }, async (p) => p.getByRole("button", { name: /Edit Compose files/ }).click()],
  [
    "desktop: error state",
    { w: 1440, h: 1000 },
    async (p) => {
      await p.getByRole("button", { name: /Edit Compose files/ }).click();
      await p.getByTestId("editor-after").fill("services: [");
    },
  ],
  ["mobile: risk list", { w: 390, h: 844 }, async () => {}],
  ["mobile: graph", { w: 390, h: 844 }, async (p) => p.getByRole("radio", { name: "Graph" }).click()],
];

const all = new Map();
for (const [label, vp, act] of states) {
  const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, reducedMotion: "reduce" });
  const page = await ctx.newPage();
  await page.goto(base, { waitUntil: "networkidle" });
  await page.waitForTimeout(500);
  await act(page);
  await page.waitForTimeout(700);
  await page.addScriptTag({ path: axePath });
  const res = await page.evaluate(async () => {
    // eslint-disable-next-line no-undef
    const r = await axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"] } });
    return r.violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.length, sample: v.nodes.slice(0, 3).map((n) => n.target.join(" ") + " :: " + (n.failureSummary ?? "").split("\n").slice(1, 2).join(" ")) }));
  });
  console.log(`\n== ${label}: ${res.length} violation types`);
  for (const v of res) {
    console.log(`  [${v.impact}] ${v.id} (${v.nodes}) ${v.help}`);
    v.sample.forEach((s) => console.log(`      ${s.slice(0, 220)}`));
    const k = `${v.impact}|${v.id}`;
    all.set(k, (all.get(k) ?? 0) + v.nodes);
  }
  await ctx.close();
}
await browser.close();
const serious = [...all.keys()].filter((k) => k.startsWith("critical") || k.startsWith("serious"));
console.log(`\nSummary: ${all.size} violation types; serious/critical: ${serious.length ? serious.join(", ") : "none"}`);
process.exit(serious.length ? 1 : 0);
