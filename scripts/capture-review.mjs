// Captures the visual-review screenshots from a running server.
// Run: node scripts/capture-review.mjs [baseUrl] [outDir]
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const base = process.argv[2] ?? "http://localhost:3200";
const out = process.argv[3] ?? ".agents/screenshots/review-m2.5";
mkdirSync(out, { recursive: true });
const settle = (page) => page.waitForTimeout(1000); // let transitions finish

const browser = await chromium.launch({ channel: process.env.PM_BROWSER_CHANNEL ?? "msedge", headless: true });
const errors = [];

async function open(viewport) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: viewport.width < 500 ? 2 : 1 });
  const page = await ctx.newPage();
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(base, { waitUntil: "networkidle" });
  await settle(page);
  return { ctx, page };
}
const scenario = (page, name) => page.getByRole("navigation", { name: "Example scenarios" }).getByRole("button", { name: new RegExp(name) });
const inspector = (page) => page.getByRole("complementary", { name: "Evidence inspector" });

{
  const { ctx, page } = await open({ width: 1440, height: 1000 });
  await scenario(page, "The Severed Cache").click();
  await settle(page);
  await page.screenshot({ path: `${out}/01-desktop-severed-cache-overview.png` });

  await page.getByRole("button", { name: /Top risk: api → redis/ }).click();
  await settle(page);
  await page.screenshot({ path: `${out}/02-desktop-severed-cache-finding-selected.png` });
  await page.screenshot({ path: `${out}/02b-desktop-severed-cache-finding-full.png`, fullPage: true });

  await scenario(page, "The Renamed Database").click();
  await settle(page);
  await page.screenshot({ path: `${out}/03-desktop-renamed-database.png` });
  await inspector(page).getByRole("button", { name: /app depends on missing service/ }).click();
  await settle(page);
  await page.screenshot({ path: `${out}/03b-desktop-renamed-database-critical-finding.png` });

  await scenario(page, "The Quiet Config Drift").click();
  await settle(page);
  await page.screenshot({ path: `${out}/05-desktop-config-drift.png` });

  await page.getByRole("button", { name: /Edit Compose files/ }).click();
  await page.getByTestId("editor-after").fill(
    "include: [monitoring.yml]\nservices:\n  proxy:\n    image: nginx:1.27\n    ports: ['80:80']\n    depends_on: [api]\n  api:\n    extends: { file: base.yml, service: api }\n    ports: ['${API_PORT}:3000']\n    depends_on: [db]\n  db:\n    image: postgres:16\n",
  );
  await page.getByRole("button", { name: /Hide Compose files/ }).click();
  await settle(page);
  await page.screenshot({ path: `${out}/06-desktop-fog-unknowns.png` });
  await ctx.close();
}

{
  const { ctx, page } = await open({ width: 390, height: 844 });
  await page.screenshot({ path: `${out}/04-mobile-severed-cache-top.png` });
  await page.screenshot({ path: `${out}/04b-mobile-severed-cache-risk-list-full.png`, fullPage: true });
  await page.getByRole("radio", { name: "Graph" }).click();
  await page.locator(".react-flow__node").first().waitFor();
  await settle(page);
  await page.locator(".react-flow").scrollIntoViewIfNeeded();
  await settle(page);
  await page.screenshot({ path: `${out}/04c-mobile-severed-cache-graph.png` });
  await ctx.close();
}

await browser.close();
console.log(errors.length ? `console errors: ${errors.join(" | ")}` : "no console errors");
