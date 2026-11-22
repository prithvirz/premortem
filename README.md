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
npm run smoke      # browser checks; needs a running server (default http://localhost:3100) and Microsoft Edge
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

Status: Milestone 2 (observatory UI) under review. Specs: `.kiro/specs/premortem-m1/`, `.kiro/specs/premortem-m2/`.
