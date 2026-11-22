// Browser verification for the Milestone 2 observatory.
// Run against a running server: node scripts/smoke-m2.mjs [baseUrl]
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

const browser = await chromium.launch({ channel: "msedge", headless: true });

async function open(viewport, opts = {}) {
  const ctx = await browser.newContext({ viewport, reducedMotion: opts.reducedMotion ?? "no-preference" });
  const page = await ctx.newPage();
  const errors = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(base, { waitUntil: "networkidle" });
  await page.locator(".react-flow__node").first().waitFor();
  return { ctx, page, errors };
}

const scenarioButton = (page, name) => page.getByRole("navigation", { name: "Example scenarios" }).getByRole("button", { name: new RegExp(name) });
const inspector = (page) => page.getByRole("complementary", { name: "Evidence inspector" });

async function overflowCheck(page, label) {
  const { scrollW, clientW } = await page.evaluate(() => ({ scrollW: document.documentElement.scrollWidth, clientW: document.documentElement.clientWidth }));
  check(`${label}: no horizontal page overflow`, scrollW <= clientW + 1, `(${scrollW} vs ${clientW})`);
}

async function overlapCheck(page, label) {
  const overlaps = await page.evaluate(() => {
    const boxes = [...document.querySelectorAll(".react-flow__node")].map((n) => ({ id: n.getAttribute("data-id"), r: n.getBoundingClientRect() }));
    const bad = [];
    for (let i = 0; i < boxes.length; i++)
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i].r, b = boxes[j].r;
        if (a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1) bad.push(`${boxes[i].id}~${boxes[j].id}`);
      }
    return bad;
  });
  check(`${label}: no overlapping graph nodes`, overlaps.length === 0, overlaps.join(", "));
}

// ---------------- Desktop ----------------
{
  const { ctx, page, errors } = await open({ width: 1440, height: 1000 });

  // Scenario 1: Severed Cache
  await scenarioButton(page, "The Severed Cache").click();
  await page.waitForTimeout(400);
  const brokenLabel = page.getByRole("button", { name: /depends_on api to redis: no shared network/ });
  check("severed cache: broken api->redis label visible", await brokenLabel.isVisible());
  check("severed cache: summary shows 1 High", /1\s*High/.test(await page.getByRole("list", { name: "Findings by severity" }).innerText()));
  await overlapCheck(page, "severed cache");
  await page.screenshot({ path: `${outDir}/desktop-severed-cache-changes.png`, fullPage: true });

  // Click the broken edge label -> edge inspector -> finding
  await brokenLabel.click();
  check("edge click opens edge evidence", /lost shared network|depends_on/.test(await inspector(page).innerText()));
  await inspector(page).getByRole("button", { name: /api and redis no longer share a network/ }).click();
  const insText = await inspector(page).innerText();
  check("finding view separates confirmed change", /Confirmed change/i.test(insText));
  check("finding view shows possible consequence", /Possible consequence/i.test(insText));
  check("finding view shows confidence + uncertainty", /Confidence: high/i.test(insText) && /Cannot be determined statically/i.test(insText));
  check("finding view shows BEFORE/AFTER evidence", /BEFORE[\s\S]*services\.api\.networks[\s\S]*AFTER/.test(insText));
  await page.screenshot({ path: `${outDir}/desktop-severed-cache-finding.png`, fullPage: false });

  // Node click
  await page.locator('.react-flow__node[data-id="svc:redis"]').click();
  await page.waitForTimeout(200);
  const nodeIns = await inspector(page).innerText();
  check("node click opens node evidence", /redis/.test(nodeIns) && /Findings on this service/i.test(nodeIns), nodeIns.slice(0, 120).replace(/\n/g, " | "));

  // Mode toggle keeps positions
  const pos = async () => page.evaluate(() => Object.fromEntries([...document.querySelectorAll(".react-flow__node")].map((n) => [n.getAttribute("data-id"), n.style.transform])));
  const diffPos = await pos();
  await page.getByRole("radio", { name: "Before" }).click();
  await page.waitForTimeout(300);
  const beforePos = await pos();
  await page.getByRole("radio", { name: "After" }).click();
  await page.waitForTimeout(300);
  const afterPos = await pos();
  const consistent = Object.keys(beforePos).every((k) => !(k in diffPos) || diffPos[k] === beforePos[k]) && Object.keys(afterPos).every((k) => !(k in diffPos) || diffPos[k] === afterPos[k]);
  check("node positions are identical across Before/Changes/After", consistent);
  await page.getByRole("radio", { name: "Before" }).click();
  await page.waitForTimeout(300);
  const beforeLabels = await page.locator(".react-flow__edgelabel-renderer").innerText().catch(() => "");
  check("BEFORE view shows no risk labels", !/no shared network|missing/.test(beforeLabels));
  await page.screenshot({ path: `${outDir}/desktop-severed-cache-before.png` });
  await page.getByRole("radio", { name: "After" }).click();

  // Keyboard: arrow keys on radiogroup
  await page.getByRole("radio", { name: "After" }).focus();
  await page.keyboard.press("ArrowLeft");
  check("arrow keys move the view toggle", (await page.getByRole("radio", { name: "Changes" }).getAttribute("aria-checked")) === "true");

  // Timeline
  await page.getByRole("button", { name: "Start investigation" }).click();
  check("timeline step 1 activates", /Step 1 of/.test(await page.getByText(/Step \d+ of \d+/).innerText()));
  for (let i = 0; i < 5; i++) await page.getByRole("button", { name: "Next step" }).click();
  await page.waitForTimeout(300);
  const stepText = await page.getByText(/Step \d+ of \d+/).innerText();
  check("timeline advances", /Step 6 of/.test(stepText), stepText);
  await page.screenshot({ path: `${outDir}/desktop-timeline.png`, fullPage: true });

  // Scenario 2
  await scenarioButton(page, "The Renamed Database").click();
  await page.waitForTimeout(400);
  check("renamed db: 2 broken labels", (await page.getByRole("button", { name: /target service missing/ }).count()) === 2);
  check("renamed db: ghost postgres node", /Removed, still referenced/.test(await page.locator('.react-flow__node[data-id="svc:postgres"]').innerText()));
  check("renamed db: verdict says Compose would reject", /expected to reject/.test(await page.getByRole("status", { name: "Analysis summary" }).innerText()));
  await overlapCheck(page, "renamed db");
  await page.screenshot({ path: `${outDir}/desktop-renamed-database.png`, fullPage: true });

  // Scenario 3
  await scenarioButton(page, "The Quiet Config Drift").click();
  await page.waitForTimeout(400);
  check("drift: verdict does not claim relationships break", /High-severity changes need review/.test(await page.getByRole("status", { name: "Analysis summary" }).innerText()));
  check("drift: no broken edges drawn for port/policy findings", (await page.getByRole("button", { name: /no shared network|target service missing/ }).count()) === 0);
  await page.locator('.react-flow__node[data-id="svc:api"]').click();
  await inspector(page).getByRole("button", { name: /JWT_SECRET/ }).click();
  const drift = await page.locator("body").innerText();
  check("drift: no secret values on page outside editors", !drift.includes("change-me"));
  await overlapCheck(page, "drift");
  await page.screenshot({ path: `${outDir}/desktop-config-drift.png`, fullPage: true });

  // Editors + error handling
  await page.getByRole("button", { name: /Edit Compose files/ }).click();
  await page.getByTestId("editor-after").fill("services:\n  api: [");
  await page.waitForTimeout(300);
  check("malformed AFTER shows an error panel", await page.getByText("The files could not be read").isVisible());
  check("malformed AFTER keeps editors visible", await page.getByTestId("editor-after").isVisible());
  await page.screenshot({ path: `${outDir}/desktop-error.png`, fullPage: true });
  await page.getByTestId("editor-after").fill("include: [extra.yml]\nservices:\n  proxy: { image: nginx }\n");
  await page.waitForTimeout(300);
  check("include warning surfaces as unknown", /include/.test(await page.locator("body").innerText()));
  await page.getByTestId("editor-policy").fill("requiredEnv: [x]");
  await page.waitForTimeout(300);
  check("invalid policy shows diagnostic", /requiredEnv/.test(await page.locator("body").innerText()) && /mapping/.test(await page.locator("body").innerText()));

  // Redaction on custom input
  await page.getByTestId("editor-policy").fill("requiredEnv:\n  api: [DB]\n");
  await page.getByTestId("editor-before").fill("services:\n  api: { image: x, environment: { DB: 'postgres://u:hunter2secret@h/db' }, ports: ['8080:80'] }\n");
  await page.getByTestId("editor-after").fill("services:\n  api: { image: x }\n");
  await page.waitForTimeout(300);
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
  await page.screenshot({ path: `${outDir}/mobile-top.png`, fullPage: false });
  await page.locator('.react-flow__node[data-id="svc:api"]').click();
  await page.waitForTimeout(400);
  const inView = await inspector(page).evaluate((el) => {
    const r = el.getBoundingClientRect();
    return r.top < window.innerHeight && r.bottom > 0;
  });
  check("mobile: tapping a node scrolls the inspector into view", inView);
  await page.screenshot({ path: `${outDir}/mobile-full.png`, fullPage: true });
  const anim = await page.evaluate(() => getComputedStyle(document.querySelector(".pm-node-risk") ?? document.body, "::after").animationName);
  check("reduced motion disables node animation", anim === "none" || anim === "");
  await overflowCheck(page, "mobile after interaction");
  check("mobile: no console errors", errors.length === 0, errors.join(" | "));
  await ctx.close();
}

// ---------------- Keyboard only ----------------
{
  const { ctx, page, errors } = await open({ width: 1280, height: 900 });
  await page.locator('.react-flow__node[data-id="svc:api"]').focus();
  await page.keyboard.press("Enter");
  await page.waitForTimeout(300);
  check("keyboard: Enter on a focused node opens its evidence", /Findings on this service/i.test(await inspector(page).innerText()));
  check("keyboard: no console errors", errors.length === 0, errors.join(" | "));
  await ctx.close();
}

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
