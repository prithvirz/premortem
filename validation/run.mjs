// Independent validation with real Docker Compose. Intended for a disposable CI runner.
// Run: node validation/run.mjs    (requires Docker Engine with the Compose v2 plugin)
// This is separate from PreMortem itself: the app never runs Docker.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, basename, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const expected = JSON.parse(readFileSync(join(root, "expected.json"), "utf8"));
const fixtures = join(root, "fixtures");
const results = [];
const run = (args, cwd) => spawnSync("docker", args, { cwd, encoding: "utf8" });

const version = run(["compose", "version"]);
if (version.status !== 0) {
  console.error("Docker Compose is not available; nothing was validated.");
  process.exit(2);
}
console.log(version.stdout.trim());

for (const c of expected.config) {
  const file = join(fixtures, c.file);
  const r = run(["compose", "-f", basename(file), "--project-name", "pm-validate", "config", "--quiet"], dirname(file));
  const got = r.status === 0 ? "valid" : "invalid";
  const out = `${r.stdout}${r.stderr}`.trim();
  const ok = got === c.expect && (!c.match || out.includes(c.match));
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"} config ${c.file}: expected ${c.expect}${c.match ? ` (${c.match})` : ""}, got ${got}${out ? ` :: ${out.split("\n")[0]}` : ""}`);
}

for (const t of expected.runtime) {
  const file = join(fixtures, t.file);
  const project = `pm-${basename(file, ".yml")}`;
  const cwd = dirname(file);
  const base = ["compose", "-f", basename(file), "--project-name", project];
  const up = run([...base, "up", "-d", "--quiet-pull"], cwd);
  if (up.status !== 0) {
    results.push(false);
    console.log(`FAIL runtime ${t.file}: could not start (${up.stderr.trim().split("\n").pop()})`);
    continue;
  }
  const r = run([...base, "exec", "-T", t.from, "getent", "hosts", t.target], cwd);
  const got = r.status === 0 ? "resolves" : "does-not-resolve";
  const ok = got === t.expect;
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"} runtime ${t.file}: ${t.from} -> ${t.target} expected ${t.expect}, got ${got}`);
  run([...base, "down", "-v", "--remove-orphans"], cwd);
}

const failed = results.filter((x) => !x).length;
console.log(`\n${results.length - failed}/${results.length} Docker validation checks passed`);
process.exit(failed ? 1 : 0);
