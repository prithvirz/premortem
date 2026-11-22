// Captures the visual-review screenshots from a running server.
// Run: node scripts/capture-review.mjs [baseUrl]
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const base = process.argv[2] ?? "http://localhost:3200";
const out = ".agents/screenshots/review";
mkdirSync(out, { recursive: true });
const settle = (page) => page.waitForTimeout(900); // let 400-500 ms transitions finish

const browser = await chromium.launch({ channel: "msedge", headless: true });
const errors = [];

async function open(viewport) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: viewport.width < 500 ? 2 : 1 });
  const page = await ctx.newPage();
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(base, { waitUntil: "networkidle" });
  await page.locator(".react-flow__node").first().waitFor();
  await settle(page);
  return { ctx, page };
}
const scenario = (page, name) => page.getByRole("navigation", { name: "Example scenarios" }).getByRole("button", { name: new RegExp(name) });

{
  const { ctx, page } = await open({ width: 1440, height: 1000 });
  await scenario(page, "The Severed Cache").click();
  await settle(page);
  await page.screenshot({ path: `${out}/01-desktop-severed-cache-overview.png` });
  await page.screenshot({ path: `${out}/01b-desktop-severed-cache-overview-full.png`, fullPage: true });

  await page.getByRole("button", { name: /depends_on api to redis: no shared network/ }).click();
  await settle(page);
  await page.getByRole("complementary", { name: "Evidence inspector" }).getByRole("button", { name: /api and redis no longer share a network/ }).click();
  await settle(page);
  await page.screenshot({ path: `${out}/02-desktop-severed-cache-finding.png` });
  await page.screenshot({ path: `${out}/02b-desktop-severed-cache-finding-full.png`, fullPage: true });

  await scenario(page, "The Renamed Database").click();
  await settle(page);
  await page.screenshot({ path: `${out}/03-desktop-renamed-database.png` });
  await page.getByRole("complementary", { name: "Evidence inspector" }).getByRole("button", { name: /app depends on missing service/ }).click();
  await settle(page);
  await page.screenshot({ path: `${out}/03b-desktop-renamed-database-critical-finding.png`, fullPage: true });
  await ctx.close();
}

{
  const { ctx, page } = await open({ width: 390, height: 844 });
  await page.screenshot({ path: `${out}/04-mobile-severed-cache-top.png` });
  await page.locator(".react-flow").scrollIntoViewIfNeeded();
  await settle(page);
  await page.screenshot({ path: `${out}/04b-mobile-severed-cache-graph.png` });
  await page.screenshot({ path: `${out}/04c-mobile-severed-cache-full.png`, fullPage: true });
  await ctx.close();
}

await browser.close();
console.log(errors.length ? `console errors: ${errors.join(" | ")}` : "no console errors");
