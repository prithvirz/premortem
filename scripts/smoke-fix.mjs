// End-to-end browser checks for the What-if Fix Preview. Captures review screenshots.
// Run against a running server: node scripts/smoke-fix.mjs [baseUrl]
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const base = process.argv[2] ?? "http://localhost:3200";
const shots = ".agents/screenshots/review-m3";
mkdirSync(shots, { recursive: true });

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` ${detail}` : ""}`);
};
const settle = (page, ms = 800) => page.waitForTimeout(ms);
const browser = await chromium.launch({ channel: "msedge", headless: true });

async function open(viewport, reducedMotion = "no-preference") {
  const ctx = await browser.newContext({ viewport, reducedMotion, deviceScaleFactor: viewport.width < 500 ? 2 : 1 });
  const page = await ctx.newPage();
  const errors = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(base, { waitUntil: "networkidle" });
  await settle(page);
  return { ctx, page, errors };
}
const scenario = (page, name) => page.getByRole("navigation", { name: "Example scenarios" }).getByRole("button", { name: new RegExp(name) });
const inspector = (page) => page.getByRole("complementary", { name: "Evidence inspector" });
const verdict = (page) => page.getByRole("status", { name: "Analysis summary" });
const showFixPanel = (page) =>
  page.getByTestId("fix-panel").evaluate((el) => {
    const box = el.closest(".pm-scroll");
    if (box) box.scrollTop = el.offsetTop - box.offsetTop - 8;
  });
const afterValue = (page) => page.getByTestId("editor-after").inputValue();
const beforeValue = (page) => page.getByTestId("editor-before").inputValue();

// ---------------- Desktop: lost shared network ----------------
{
  const { ctx, page, errors } = await open({ width: 1440, height: 1000 });
  await scenario(page, "The Severed Cache").click();
  await settle(page);
  await page.getByRole("button", { name: /Edit Compose files/ }).click();
  const A0 = await afterValue(page);
  const B0 = await beforeValue(page);
  await page.getByRole("button", { name: /Hide Compose files/ }).click();

  await page.getByRole("button", { name: /Top risk: api → redis/ }).click();
  await settle(page, 400);
  const panel = page.getByTestId("fix-panel");
  check("network: fix panel offered for the high finding", await panel.isVisible());
  check("network: suggested option is attaching api to cache", /Attach api to network "cache"/.test(await panel.innerText()) && /suggested/.test(await panel.innerText()));
  check("network: isolation/security disclosure shown", /weakens that isolation/.test(await panel.innerText()));

  await panel.getByRole("button", { name: "Preview possible fix" }).click();
  await settle(page, 1300);
  const fv = await page.getByTestId("fix-verdict").innerText();
  check("network: engine verdict says warning cleared", /Configuration warning cleared after reanalysis\.$/.test(fv.trim()), fv);
  const diff = await page.getByTestId("fix-diff").innerText();
  check("network: diff shows exactly the networks line change", /networks: \[frontend, backend\][\s\S]*networks: \[frontend, backend, cache\]/.test(diff) && diff.split("\n").filter((l) => /^[+−]/.test(l.trim())).length === 2);
  check("network: restored relationship drawn in graph", await page.getByRole("button", { name: /depends_on api to redis, in preview: shared network restored/ }).isVisible());
  const tag = await page.locator('.react-flow__node[data-id="svc:api"] [data-network]', { hasText: "cache" }).innerText();
  check("network: proposed cache tag on api", /preview/i.test(tag), JSON.stringify(tag));
  check("network: no severed edge in proposed view", (await page.getByRole("button", { name: /severed/ }).count()) === 0);
  check("network: current verdict still describes the real files", /api → redis: shared network lost/.test(await verdict(page).innerText()));
  await showFixPanel(page);
  await page.screenshot({ path: `${shots}/01-desktop-network-fix-preview.png` });
  await page.screenshot({ path: `${shots}/01b-desktop-network-fix-preview-full.png`, fullPage: true });

  await page.getByRole("radio", { name: "Current AFTER" }).click();
  await settle(page, 400);
  check("network: compare toggle shows the severed current state", await page.getByRole("button", { name: /api to redis, severed/ }).isVisible());
  await page.screenshot({ path: `${shots}/02-desktop-network-compare-current.png` });
  await page.getByRole("radio", { name: "Proposed AFTER" }).click();

  // Editor untouched by preview
  await page.getByRole("button", { name: /Edit Compose files/ }).click();
  check("network: preview did not mutate AFTER editor", (await afterValue(page)) === A0);
  check("network: preview did not mutate BEFORE editor", (await beforeValue(page)) === B0);
  await page.getByRole("button", { name: /Hide Compose files/ }).click();

  // Discard restores state
  await page.getByRole("button", { name: "Discard preview" }).first().click();
  await settle(page, 400);
  check("network: discard removes preview toolbar", (await page.getByTestId("preview-toolbar").count()) === 0);
  check("network: discard restores severed edge", await page.getByRole("button", { name: /api to redis, severed/ }).isVisible());
  check("network: discard leaves no restored edges", (await page.getByRole("button", { name: /in preview/ }).count()) === 0);

  // Apply requires explicit confirmation; cancel does nothing
  await inspector(page).getByTestId("fix-panel").getByRole("button", { name: "Preview possible fix" }).click();
  await settle(page, 600);
  await page.getByRole("button", { name: "Apply to AFTER editor…" }).click();
  check("network: apply asks for confirmation", await page.getByRole("alertdialog").isVisible());
  await page.getByRole("button", { name: "Cancel" }).click();
  await page.getByRole("button", { name: /Edit Compose files/ }).click();
  check("network: cancel leaves AFTER unchanged", (await afterValue(page)) === A0);
  await page.getByRole("button", { name: /Hide Compose files/ }).click();

  await page.getByRole("button", { name: "Apply to AFTER editor…" }).click();
  await page.getByRole("button", { name: "Confirm: apply to AFTER editor" }).click();
  await settle(page, 900);
  await page.getByRole("button", { name: /Edit Compose files/ }).click();
  const A1 = await afterValue(page);
  const changed = A0.split("\n").filter((l, i) => l !== A1.split("\n")[i]);
  check("network: apply changes only the api networks line", A1 === A0.replace("    networks: [frontend, backend]\n  db:", "    networks: [frontend, backend, cache]\n  db:") && changed.length === 1, changed.join(" | "));
  check("network: BEFORE untouched after apply", (await beforeValue(page)) === B0);
  const v1 = await verdict(page).innerText();
  check("network: reanalysis of applied AFTER no longer reports api → redis", !/api → redis/.test(v1) && /No supported risks detected/.test(v1));
  await page.screenshot({ path: `${shots}/03-desktop-network-applied.png` });
  await page.getByRole("button", { name: "Undo" }).click();
  await settle(page, 600);
  check("network: undo restores the original AFTER", (await afterValue(page)) === A0);
  check("network: undo restores the original verdict", /api → redis: shared network lost/.test(await verdict(page).innerText()));

  // Editing during a preview invalidates it
  await page.getByRole("button", { name: /Top risk: api → redis/ }).click();
  await inspector(page).getByTestId("fix-panel").getByRole("button", { name: "Preview possible fix" }).click();
  await settle(page, 500);
  await page.getByTestId("editor-after").press("End");
  await page.getByTestId("editor-after").type(" ");
  await settle(page, 400);
  check("network: editing the file discards a stale preview", (await page.getByTestId("preview-toolbar").count()) === 0);

  // Ineligible findings explain why
  await scenario(page, "The Severed Cache").click();
  await settle(page, 400);
  await inspector(page).getByText("Context, informational only").click();
  await inspector(page).getByRole("button", { name: /db is now isolated/ }).click();
  check("network: info finding declines with a reason", /No automatic correction is offered[\s\S]*intentional/.test(await page.getByTestId("fix-ineligible").innerText()));
  check("desktop network: no console errors", errors.length === 0, errors.join(" | "));
  await ctx.close();
}

// ---------------- Desktop: renamed dependency ----------------
{
  const { ctx, page, errors } = await open({ width: 1440, height: 1000 });
  await scenario(page, "The Renamed Database").click();
  await settle(page);
  await page.getByRole("button", { name: /Edit Compose files/ }).click();
  const A0 = await afterValue(page);
  await page.getByRole("button", { name: /Hide Compose files/ }).click();

  await page.getByRole("button", { name: /Top risk: app, worker → postgres/ }).click();
  await settle(page, 400);
  const panel = page.getByTestId("fix-panel");
  const previewBtn = panel.getByRole("button", { name: "Preview possible fix" });
  check("rename: hint is disclosed as not proof", /hint, not proof/.test(await panel.innerText()));
  check("rename: preview disabled until the user confirms the target", await previewBtn.isDisabled());
  await page.getByTestId("fix-confirm").check();
  check("rename: preview enabled after confirmation", await previewBtn.isEnabled());
  await previewBtn.click();
  await settle(page, 1300);
  check("rename: engine verdict says warning cleared", /Configuration warning cleared after reanalysis\./.test(await page.getByTestId("fix-verdict").innerText()));
  const ins = await panel.innerText();
  check("rename: both missing-service findings listed as cleared", /Cleared \(2\)/i.test(ins) && /app depends on missing service/.test(ins) && /worker depends on missing service/.test(ins));
  check("rename: no new findings", /New in the proposed AFTER \(0\)/i.test(ins));
  check("rename: two reconnected relationships in graph", (await page.getByRole("button", { name: /to database, in preview: reconnected/ }).count()) === 2);
  check("rename: ghost postgres gone in proposed view", (await page.locator('.react-flow__node[data-id="svc:postgres"]').count()) === 0);
  await showFixPanel(page);
  await page.screenshot({ path: `${shots}/04-desktop-dependency-fix-preview.png` });
  await page.screenshot({ path: `${shots}/04b-desktop-dependency-fix-preview-full.png`, fullPage: true });
  await page.getByRole("radio", { name: "Current AFTER" }).click();
  await settle(page, 400);
  check("rename: current side still shows the ghost and severed edges", (await page.locator('.react-flow__node[data-id="svc:postgres"]').count()) === 1 && (await page.getByRole("button", { name: /severed: target service missing/ }).count()) === 2);
  await page.getByRole("radio", { name: "Proposed AFTER" }).click();
  await page.getByRole("button", { name: /Edit Compose files/ }).click();
  check("rename: preview did not mutate AFTER editor", (await afterValue(page)) === A0);
  await page.getByRole("button", { name: "Apply to AFTER editor…" }).click();
  await page.getByRole("button", { name: "Confirm: apply to AFTER editor" }).click();
  await settle(page, 900);
  const A1 = await afterValue(page);
  check("rename: applied AFTER retargets both references and keeps the condition", A1.includes("depends_on:\n      - database\n") && A1.includes("      database:\n        condition: service_healthy") && !/postgres:\n        condition/.test(A1));
  check("rename: reanalysis of applied AFTER reports no risks", /No supported risks detected/.test(await verdict(page).innerText()));
  check("desktop rename: no console errors", errors.length === 0, errors.join(" | "));
  await ctx.close();
}

// ---------------- Desktop: policy finding is never auto-fixed ----------------
{
  const { ctx, page, errors } = await open({ width: 1280, height: 900 });
  await scenario(page, "The Quiet Config Drift").click();
  await settle(page, 400);
  await page.getByRole("button", { name: /Top risk: api: required/ }).click();
  check("policy: no automatic fix, never invents values", /never reads or invents/.test(await page.getByTestId("fix-ineligible").innerText()));
  check("policy: no console errors", errors.length === 0, errors.join(" | "));
  await ctx.close();
}

// ---------------- Desktop: rename onto a disconnected network (M3.1) ----------------
{
  const { ctx, page, errors } = await open({ width: 1440, height: 1000 });
  const before = "services:\n  app:\n    image: acme/app:1.4\n    depends_on: [postgres]\n  postgres:\n    image: postgres:16\n";
  const after =
    "services:\n  app:\n    image: acme/app:1.4\n    environment:\n      DATABASE_URL: postgres://app:hunt3r-pass@postgres:5432/app\n    depends_on: [postgres]\n  database:\n    image: postgres:16\n    networks: [data]\nnetworks:\n  data:\n";
  await page.getByRole("button", { name: /Edit Compose files/ }).click();
  await page.getByTestId("editor-before").fill(before);
  await page.getByTestId("editor-after").fill(after);
  await page.getByTestId("editor-policy").fill("");
  await settle(page, 600);
  check("stranded: headline is the missing service", /app → postgres: target service missing/.test(await verdict(page).innerText()));
  await page.getByRole("button", { name: /Top risk: app → postgres/ }).click();
  await settle(page, 400);
  await page.getByTestId("fix-confirm").check();
  await page.getByTestId("fix-panel").getByRole("button", { name: "Preview possible fix" }).click();
  await settle(page, 1300);
  const fv = await page.getByTestId("fix-verdict").innerText();
  const tally = await page.getByTestId("fix-tally").innerText();
  check("stranded: verdict says cleared but a new risk was detected", /Configuration warning cleared after reanalysis, but 1 new risk detected\./.test(fv), fv);
  check("stranded: summary shows 1 resolved and 1 new risk", /1 resolved · 1 new risk/.test(tally), tally);
  check("stranded: toolbar verdict is not styled as resolved", (await page.getByTestId("preview-toolbar-verdict").evaluate((el) => getComputedStyle(el).color)) === "rgb(255, 154, 60)");
  const framed = await page.evaluate(() => {
    const c = document.querySelector(".react-flow").getBoundingClientRect();
    return ["svc:app", "svc:database"].every((id) => {
      const r = document.querySelector(`.react-flow__node[data-id="${id}"]`)?.getBoundingClientRect();
      return r && r.left >= c.left && r.right <= c.right && r.top >= c.top && r.bottom <= c.bottom;
    });
  });
  check("stranded: both services of the new risk are framed in the graph", framed);
  check("stranded: verdict is not styled as resolved", (await page.getByTestId("fix-verdict").evaluate((el) => getComputedStyle(el).color)) === "rgb(255, 154, 60)");
  const ins = await page.getByTestId("fix-panel").innerText();
  check("stranded: new disconnected-network finding listed", /New in the proposed AFTER \(1\)[\s\S]*app → database: no shared network/i.test(ins));
  check("stranded: no 'fixed' or 'safe' claims", !/deployment (is )?fixed|safe to deploy/i.test(ins + fv));
  check("stranded: proposed edge is possibly affected, not restored", (await page.getByRole("button", { name: /app to database: possibly: no shared network/ }).count()) === 1 && (await page.getByRole("button", { name: /in preview/ }).count()) === 0);
  const textOutsideEditors = await page.evaluate(() => {
    const clone = document.body.cloneNode(true);
    clone.querySelectorAll("textarea").forEach((t) => t.remove());
    return clone.textContent ?? "";
  });
  check("stranded: secret in the diff context is redacted", !textOutsideEditors.includes("hunt3r-pass") && /\[REDACTED\]/.test(await page.getByTestId("fix-diff").innerText()));
  check("stranded: AFTER editor unchanged by preview", (await afterValue(page)) === after);
  await page.getByRole("button", { name: /Hide Compose files/ }).click();
  await settle(page, 300);
  await showFixPanel(page);
  await page.screenshot({ path: `${shots}/06-desktop-rename-new-risk-preview.png` });
  check("stranded: no console errors", errors.length === 0, errors.join(" | "));
  await ctx.close();
}

// ---------------- Desktop: preview keeps the finding title and correction in view ----------------
{
  const { ctx, page } = await open({ width: 1440, height: 900 });
  await page.getByRole("button", { name: /Top risk: api → redis/ }).click();
  await settle(page, 400);
  await page.getByTestId("fix-panel").getByRole("button", { name: "Preview possible fix" }).click();
  await settle(page, 900);
  const vis = await page.evaluate(() => {
    const box = document.querySelector('aside[aria-label="Evidence inspector"] .pm-scroll').getBoundingClientRect();
    const inView = (sel) => {
      const r = document.querySelector(sel)?.getBoundingClientRect();
      return !!r && r.top >= box.top - 1 && r.bottom <= box.bottom + 1 && r.top >= 0 && r.bottom <= window.innerHeight;
    };
    return { context: inView('[data-testid="fix-context"]'), verdict: inView('[data-testid="fix-verdict"]') };
  });
  check("scroll: finding title and chosen correction visible after preview opens", vis.context, JSON.stringify(vis));
  check("scroll: reanalysis verdict visible after preview opens", vis.verdict, JSON.stringify(vis));
  await ctx.close();
}

// ---------------- Mobile ----------------
{
  const { ctx, page, errors } = await open({ width: 390, height: 844 }, "reduce");
  const nav = page.getByRole("navigation", { name: "Example scenarios" });
  const overflowing = await nav.evaluate((el) => el.scrollWidth > el.clientWidth);
  const fade = page.locator("nav[aria-label='Example scenarios'] + div[aria-hidden='true']");
  check("mobile: scenario row shows a scroll affordance while more is off-screen", overflowing && (await fade.evaluate((el) => getComputedStyle(el).opacity)) === "1");
  await nav.evaluate((el) => el.scrollTo({ left: el.scrollWidth }));
  await settle(page, 400);
  check("mobile: affordance hides at the end of the row", (await fade.evaluate((el) => getComputedStyle(el).opacity)) === "0");
  await nav.evaluate((el) => el.scrollTo({ left: 0 }));

  await page.getByRole("button", { name: /Top risk: api → redis/ }).click();
  await settle(page, 600);
  await page.getByTestId("fix-panel").getByRole("button", { name: "Preview possible fix" }).click();
  await settle(page, 600);
  check("mobile: preview verdict visible", /Configuration warning cleared after reanalysis/.test(await page.getByTestId("fix-verdict").innerText()));
  const restoredItem = page.getByRole("button", { name: /api.*redis.*restored in preview/s });
  check("mobile: risk list shows the restored relationship", (await restoredItem.count()) === 1);
  const { scrollW, clientW } = await page.evaluate(() => ({ scrollW: document.documentElement.scrollWidth, clientW: document.documentElement.clientWidth }));
  check("mobile: no horizontal overflow during preview", scrollW <= clientW + 1, `(${scrollW} vs ${clientW})`);
  const small = await page.evaluate(() =>
    [...document.querySelectorAll('[data-testid="fix-panel"] button, [data-testid="preview-toolbar"] button')]
      .filter((b) => b.offsetParent !== null)
      .map((b) => ({ t: (b.textContent ?? "").trim().slice(0, 24), h: b.getBoundingClientRect().height }))
      .filter((b) => b.h < 36),
  );
  check("mobile: fix controls are touch-sized", small.length === 0, small.map((s) => `${s.t}:${Math.round(s.h)}`).join(", "));
  await page.getByTestId("preview-toolbar").scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${shots}/05-mobile-network-preview-list.png` });
  await page.getByTestId("fix-verdict").scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${shots}/05b-mobile-network-preview-inspector.png` });
  await page.getByRole("radio", { name: "Graph" }).click();
  await page.locator(".react-flow__node").first().waitFor();
  await settle(page, 600);
  await page.getByTestId("preview-toolbar").scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${shots}/05c-mobile-network-preview-graph.png` });
  const anim = await page.evaluate(() => {
    const el = document.querySelector(".pm-restore");
    return el ? getComputedStyle(el).animationName : "missing";
  });
  check("mobile: reduced motion disables the restore draw-in", anim === "none", anim);
  await page.getByRole("button", { name: "Discard preview" }).first().click();
  check("mobile: discard works", (await page.getByTestId("preview-toolbar").count()) === 0);
  check("mobile: no console errors", errors.length === 0, errors.join(" | "));
  await ctx.close();
}

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} fix checks passed`);
process.exit(failed.length ? 1 : 0);
