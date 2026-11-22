// Writes the example scenarios as real Compose files for independent validation with Docker.
// Run: node scripts/export-compose-fixtures.mjs   (Node 22.18+ / 23.6+ load the .ts module natively)
// tests/validation-fixtures.test.ts fails if these files drift from src/lib/examples/scenarios.ts.
import { mkdirSync, writeFileSync } from "node:fs";
import { SCENARIOS } from "../src/lib/examples/scenarios.ts";

for (const s of SCENARIOS) {
  const dir = `validation/fixtures/${s.id}`;
  mkdirSync(dir, { recursive: true });
  writeFileSync(`${dir}/before.yml`, s.before);
  writeFileSync(`${dir}/after.yml`, s.after);
  console.log(`wrote ${dir}/{before,after}.yml`);
}
