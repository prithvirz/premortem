// Browser verification for the PreMortem observatory.
// Run against a running server: node scripts/smoke.mjs [baseUrl]
// Screenshots go to .agents/screenshots/ (gitignored).
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const base = process.argv[2] ?? "http://localhost:3100";
const outDir = ".agents/screenshots";
mkdirSync(outDir, { recursive: true });

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` ${detail}` : ""}`);
};
const settle = (page, ms = 700) => page.waitForTimeout(ms);

const browser = await chromium.launch({ channel: process.env.PM_BROWSER_CHANNEL ?? "msedge", headless: true });

async function open(viewport, opts = {}) {
  const ctx = await browser.newContext({ viewport, reducedMotion: opts.reducedMotion ?? "no-preference" });
  const page = await ctx.newPage();
  const errors = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(base, { waitUntil: "networkidle" });
  await settle(page);
  return { ctx, page, errors };
}

const scenarioButton = (page, name) => page.getByRole("navigation", { name: "Example scenarios" }).getByRole("button", { name: new RegExp(name) });
const inspector = (page) => page.getByRole("complementary", { name: "Evidence inspector" });
const verdict = (page) => page.getByRole("status", { name: "Analysis summary" });

async function overflowCheck(page, label) {
  const { scrollW, clientW } = await page.evaluate(() => ({ scrollW: document.documentElement.scrollWidth, clientW: document.documentElement.clientWidth }));
  check(`${label}: no horizontal page overflow`, scrollW <= clientW + 1, `(${scrollW} vs ${clientW})`);
}

/** Nodes must not overlap each other, and edge labels must not overlap node borders. */
async function overlapCheck(page, label) {
  const bad = await page.evaluate(() => {
    const rect = (el) => el.getBoundingClientRect();
    const hit = (a, b) => a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1;
    const nodes = [...document.querySelectorAll(".react-flow__node")].map((n) => ({ id: n.getAttribute("data-id"), r: rect(n) }));
    const labels = [...document.querySelectorAll("[data-edge-label]")].map((l) => ({ id: l.getAttribute("data-edge-label"), r: rect(l) }));
    const out = [];
    for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) if (hit(nodes[i].r, nodes[j].r)) out.push(`node ${nodes[i].id}~${nodes[j].id}`);
    for (const l of labels) for (const n of nodes) if (hit(l.r, n.r)) out.push(`label ${l.id}~${n.id}`);
    return out;
  });
  check(`${label}: no overlapping nodes or labels`, bad.length === 0, bad.join(", "));
  const fit = await page.evaluate(() => {
    const c = document.querySelector(".react-flow").getBoundingClientRect();
    return [...document.querySelectorAll(".react-flow__node")]
      .map((n) => ({ id: n.getAttribute("data-id"), r: n.getBoundingClientRect() }))
      .filter(({ r }) => r.left < c.left || r.right > c.right || r.top < c.top || r.bottom > c.bottom)
      .map((x) => x.id);
  });
  check(`${label}: every node fits inside the canvas`, fit.length === 0, fit.join(", "));
}

// ---------------- Desktop ----------------
{
  const { ctx, page, errors } = await open({ width: 1440, height: 1000 });
  await page.locator(".react-flow__node").first().waitFor();

  // Scenario 1: Severed Cache
  await scenarioButton(page, "The Severed Cache").click();
  await settle(page);
  check("severed: verdict names the services", /api → redis: shared network lost/.test(await verdict(page).innerText()));
  check("severed: verdict marks the claim as inferred", /inferred from configuration/i.test(await verdict(page).innerText()));
  const brokenLabel = page.getByRole("button", { name: /depends_on api to redis, severed: no shared network/ });
  check("severed: severed api->redis label visible", await brokenLabel.isVisible());
  const dash = await page.evaluate(() => document.getElementById("e:depends_on:api->redis")?.style.strokeDasharray ?? "");
  check("severed: broken edge is drawn with a deliberate gap", dash.split(/[ ,]+/).filter(Boolean).length === 3, `(${dash})`);
  check("severed: no membership curves on canvas", (await page.locator(".react-flow__node[data-id^='net:']").count()) === 0);
  check("severed: network tags on nodes", (await page.locator('.react-flow__node[data-id="svc:redis"] [data-network]').count()) >= 1);
  const genericChanged = await page.locator(".react-flow__node span", { hasText: /^Changed$/ }).count();
  check("severed: no generic 'Changed' badges", genericChanged === 0);
  check("severed: specific 'Networks changed' badge present", (await page.locator(".react-flow__node", { hasText: "Networks changed" }).count()) > 0);
  await overlapCheck(page, "severed");

  // Selecting the finding keeps the cause (networks) lit and dims unrelated services
  await brokenLabel.click();
  await settle(page);
  await inspector(page).getByRole("button", { name: /api and redis no longer share a network/ }).click();
  await settle(page);
  const lostChip = page.locator('[data-network-chip][data-emphasis="lost"]');
  check("severed: lost network chip is emphasized", (await lostChip.count()) === 1 && /default/.test(await lostChip.innerText()));
  const lostOpacity = await lostChip.evaluate((el) => getComputedStyle(el).opacity);
  check("severed: lost network chip is not dimmed", Number(lostOpacity) > 0.9, `(opacity ${lostOpacity})`);
  check("severed: lost tag emphasized on api and redis nodes", (await page.locator('.react-flow__node [data-network][data-emphasis="lost"]').count()) === 2);
  const webDim = await page.locator('.react-flow__node[data-id="svc:web"] .pm-node').evaluate((el) => el.classList.contains("pm-dim"));
  check("severed: unrelated web service is dimmed", webDim);
  const ins = await inspector(page).innerText();
  check("finding view separates confirmed change and possible consequence", /Confirmed change/i.test(ins) && /Possible consequence/i.test(ins));
  check("finding view shows confidence and what cannot be determined", /Confidence: high/i.test(ins) && /Cannot be determined statically/i.test(ins));

  // Node click and keyboard via mode toggle
  await page.locator('.react-flow__node[data-id="svc:redis"]').click();
  await settle(page, 300);
  check("node click opens node evidence", /Findings on this service/i.test(await inspector(page).innerText()));
  const pos = async () => page.evaluate(() => Object.fromEntries([...document.querySelectorAll(".react-flow__node")].map((n) => [n.getAttribute("data-id"), n.style.transform])));
  const p1 = await pos();
  await page.getByRole("radio", { name: "Before" }).click();
  await settle(page, 300);
  const p2 = await pos();
  await page.getByRole("radio", { name: "After" }).click();
  await settle(page, 300);
  const p3 = await pos();
  check("node positions identical across views", Object.keys(p2).every((k) => !(k in p1) || p1[k] === p2[k]) && Object.keys(p3).every((k) => !(k in p1) || p1[k] === p3[k]));
  await page.getByRole("radio", { name: "Before" }).click();
  await settle(page, 300);
  check("BEFORE view shows no risk labels", (await page.locator("[data-edge-label]").count()) === 0 || !/severed|possibly/.test(await page.locator(".react-flow__edgelabel-renderer").innerText()));
  await page.getByRole("radio", { name: "Before" }).focus();
  await page.keyboard.press("ArrowRight");
  check("arrow keys move the view toggle", (await page.getByRole("radio", { name: "Changes" }).getAttribute("aria-checked")) === "true");

  // Timeline
  check("timeline renamed to Deployment change story", await page.getByRole("heading", { name: "Deployment change story" }).isVisible());
  await page.getByRole("button", { name: "Start the change story" }).click();
  for (let i = 0; i < 5; i++) await page.getByRole("button", { name: "Next step" }).click();
  await settle(page, 300);
  check("timeline advances", /Step 6 of/.test(await page.getByText(/Step \d+ of \d+/).innerText()));

  // Scenario 2
  await scenarioButton(page, "The Renamed Database").click();
  await settle(page);
  check("renamed: verdict names both dependents and the target", /app, worker → postgres: target service missing/.test(await verdict(page).innerText()));
  check("renamed: two severed labels", (await page.getByRole("button", { name: /severed: target service missing/ }).count()) === 2);
  check("renamed: ghost postgres node", /Removed, still referenced/.test(await page.locator('.react-flow__node[data-id="svc:postgres"]').innerText()));
  check("renamed: added database node is distinct", (await page.locator('.react-flow__node[data-id="svc:database"] [data-visual="added"]').count()) === 1);
  const critColor = await page.locator('.react-flow__node[data-id="svc:app"] span', { hasText: "Critical" }).evaluate((el) => getComputedStyle(el).color);
  check("renamed: critical node badge uses the critical red", critColor === "rgb(255, 77, 94)", `(${critColor})`);
  await overlapCheck(page, "renamed");

  // Scenario 3
  await scenarioButton(page, "The Quiet Config Drift").click();
  await settle(page);
  const v3 = await verdict(page).innerText();
  check("drift: verdict names the policy finding, not relationships", /api: required JWT_SECRET no longer declared/.test(v3) && /Required by your policy/.test(v3));
  check("drift: no severed edges for port/policy findings", (await page.locator("[data-edge-label]").count()) === 0);
  await overlapCheck(page, "drift");
  const zeroColor = await verdict(page).locator("li", { hasText: "Critical" }).evaluate((el) => getComputedStyle(el).color);
  check("drift: zero counts are neutral", !/255, 77, 94/.test(zeroColor), `(${zeroColor})`);

  // Editors, fog and error handling
  await page.getByRole("button", { name: /Edit Compose files/ }).click();
  await page.getByTestId("editor-after").fill("services:\n  api: [");
  await settle(page, 300);
  check("malformed AFTER shows an error panel", await page.getByText("The files could not be read").isVisible());
  await page.getByTestId("editor-after").fill("include: [extra.yml]\nservices:\n  proxy:\n    image: nginx\n    extends: { service: base }\n");
  await settle(page);
  check("file-level unknown renders labeled fog banner", /Fog: 1 setting outside this analysis/.test(await page.locator(".react-flow").innerText()));
  check("service-level unknown renders fog + label on node", (await page.locator('.react-flow__node[data-id="svc:proxy"] .pm-fog').count()) === 1 && /Unresolved/.test(await page.locator('.react-flow__node[data-id="svc:proxy"]').innerText()));
  await page.getByTestId("editor-policy").fill("requiredEnv:\n  api: [DB]\n");
  await page.getByTestId("editor-before").fill("services:\n  api: { image: x, environment: { DB: 'postgres://u:hunter2secret@h/db' }, ports: ['8080:80'] }\n");
  await page.getByTestId("editor-after").fill("services:\n  api: { image: x }\n");
  await settle(page, 300);
  const textOutsideEditors = await page.evaluate(() => {
    const clone = document.body.cloneNode(true);
    clone.querySelectorAll("textarea").forEach((t) => t.remove());
    return clone.textContent ?? "";
  });
  check("custom secret never rendered outside editors", !textOutsideEditors.includes("hunter2secret"));

  await overflowCheck(page, "desktop");
  check("desktop: no console errors", errors.length === 0, errors.join(" | "));
  await ctx.close();
}

// ---------------- Mobile ----------------
{
  const { ctx, page, errors } = await open({ width: 390, height: 844 }, { reducedMotion: "reduce" });
  await overflowCheck(page, "mobile");
  check("mobile: risk list is the default view", (await page.getByRole("radio", { name: "Risk list" }).getAttribute("aria-checked")) === "true" && (await page.locator(".react-flow").count()) === 0);
  check("mobile: severed relationship listed", /api[\s\S]*redis[\s\S]*severed/.test(await page.getByRole("button", { name: /api.*redis.*severed/s }).first().innerText()));
  check("mobile: legend collapsed by default", (await page.getByRole("button", { name: "Legend" }).getAttribute("aria-expanded")) === "false");
  const small = await page.evaluate(() =>
    [...document.querySelectorAll("main button, nav button, section button, aside button")]
      .filter((b) => b.offsetParent !== null && !b.closest(".react-flow"))
      .map((b) => ({ t: (b.textContent ?? "").trim().slice(0, 20), h: b.getBoundingClientRect().height }))
      .filter((b) => b.h < 32),
  );
  check("mobile: touch targets at least 32px tall", small.length === 0, small.map((s) => `${s.t}:${Math.round(s.h)}`).join(", "));
  await page.getByRole("button", { name: /^api/ }).first().click();
  await settle(page, 500);
  const inView = await inspector(page).evaluate((el) => {
    const r = el.getBoundingClientRect();
    return r.top < window.innerHeight && r.bottom > 0;
  });
  check("mobile: tapping a service scrolls the inspector into view", inView);
  await page.getByRole("radio", { name: "Graph" }).click();
  await page.locator(".react-flow__node").first().waitFor();
  await settle(page);
  const zoom = await page.evaluate(() => {
    const t = document.querySelector(".react-flow__viewport")?.style.transform ?? "";
    return Number(/scale\(([\d.]+)\)/.exec(t)?.[1] ?? 0);
  });
  const topVisible = await page.evaluate(() => {
    const c = document.querySelector(".react-flow").getBoundingClientRect();
    return ["svc:api", "svc:redis"].every((id) => {
      const r = document.querySelector(`.react-flow__node[data-id="${id}"]`)?.getBoundingClientRect();
      return r && r.right > c.left + 20 && r.left < c.right - 20 && r.bottom > c.top && r.top < c.bottom;
    });
  });
  check("mobile: graph opens on the top risk (api and redis visible)", topVisible);
  check("mobile: graph zoom keeps text readable", zoom >= 0.54, `(scale ${zoom})`);
  const anim = await page.evaluate(() => getComputedStyle(document.querySelector(".pm-node-risk") ?? document.body, "::after").animationName);
  check("reduced motion disables node animation", anim === "none" || anim === "");
  const fitBtn = await page.locator(".react-flow__controls-fitview").isVisible();
  check("mobile: zoom controls reachable", fitBtn);
  await overflowCheck(page, "mobile graph");
  check("mobile: no console errors", errors.length === 0, errors.join(" | "));
  await ctx.close();
}

// ---------------- Keyboard only ----------------
{
  const { ctx, page, errors } = await open({ width: 1280, height: 900 });
  await page.locator('.react-flow__node[data-id="svc:api"]').waitFor();
  await page.locator('.react-flow__node[data-id="svc:api"]').focus();
  await page.keyboard.press("Enter");
  await settle(page, 300);
  check("keyboard: Enter on a focused node opens its evidence", /Findings on this service/i.test(await inspector(page).innerText()));
  await page.getByRole("button", { name: /Top risk: api → redis/ }).focus();
  await page.keyboard.press("Enter");
  await settle(page, 300);
  check("keyboard: verdict headline opens the top finding", /api and redis no longer share a network/.test(await inspector(page).innerText()));
  await page.locator(".react-flow__controls-fitview").click({ timeout: 3000 }).then(() => check("fit view button is clickable (not covered)", true)).catch(() => check("fit view button is clickable (not covered)", false));
  check("keyboard: no console errors", errors.length === 0, errors.join(" | "));
  await ctx.close();
}

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
