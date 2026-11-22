# Tasks: Milestone 1

- [x] 1. Scaffold Next.js (App Router), strict TypeScript, Tailwind 4, Vitest, `yaml` parser
- [x] 2. Define normalized model and finding types (`types.ts`)
- [x] 3. Safe YAML parsing with size, duplicate-key, and alias limits (`parse.ts`)
- [x] 4. Port parser: short/long syntax, IPv6, ranges (`ports.ts`)
- [x] 5. Redaction and secret-free model (`redact.ts`)
- [x] 6. Network graph semantics: default network, network_mode, identities (`graph.ts`)
- [x] 7. Rule: network-lost and network-undefined
- [x] 8. Rule: dependency-dangling with rename heuristic
- [x] 9. Rule: port removed / host changed / container changed / exposure widened
- [x] 10. Rule: required env policy
- [x] 11. Structural diff and `analyze()` orchestration
- [x] 12. Three example scenarios with exact expected findings
- [x] 13. Tests: parser, rules, scenarios, error handling (66 tests)
- [x] 14. Minimal workbench UI (two editors, scenario buttons, findings list)
- [x] 15. Verify: `npm test`, `npx tsc --noEmit`, `npm run build`
- [ ] M2 (not started): graph visualization, BEFORE/AFTER mode, timeline, evidence panel, summary
