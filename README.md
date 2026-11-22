# PreMortem

See what your deployment might break before it goes live.

PreMortem compares BEFORE and AFTER Docker Compose files and reports evidence-based configuration risks. It is static analysis in the browser: no Docker, no upload, no execution. It reports confirmed changes separately from possible consequences and does not claim to predict failures with certainty.

## Run
```
npm install
npm run dev        # http://localhost:3000
npm test
npm run typecheck
npm run build
npm run smoke      # browser checks (both suites); needs `npm run build && npm start -- -p 3200` and Microsoft Edge
npm run a11y       # axe-core WCAG 2.1 A/AA audit against the same server
```

## Use the engine directly
```ts
import { analyze } from "@/lib/compose/analyze";
const report = analyze({ before, after, policyText: "requiredEnv:\n  api: [DATABASE_URL]" });
if (report.ok) console.log(report.findings);
```

## Docs
- Specs: `.kiro/specs/premortem-m1/`
- Decisions: `.kiro/decisions/decisions.md`
- Kiro usage record: `.kiro/KIRO_USAGE.md`

Status: Milestone 3.1 (comparison engine, observatory UI, What-if Fix Preview, release audit). Specs: `.kiro/specs/`. Not yet deployed.
