# Release preparation (Kiroween 2026)

## Proposed public repository

- **Name:** `premortem`
- **Description:** See what your Docker Compose deployment might break before it goes live. Local, evidence-based change analysis with what-if fix previews.
- **Topics:** `docker-compose`, `static-analysis`, `devops`, `nextjs`, `react-flow`, `kiro`, `kiroween`

## Release checklist

### Repository and licensing
- [x] MIT `LICENSE` (copyright 2026, holder taken from the Git author name; **confirm before publishing**)
- [x] `THIRD_PARTY_NOTICES.md`: all bundled code is MIT, ISC, BSD-3-Clause, 0BSD, or Apache-2.0; fonts are OFL 1.1; sharp (LGPL binaries) and caniuse-lite (CC-BY) are not bundled
- [x] `.kiro/` tracked at the repository root: specs, decisions, Kiro usage record, specs index
- [x] `.kiro/` reviewed: no secrets, personal data, session ids, generated artifacts, or internal-only notes
- [x] Secret scan of every commit (AWS, GitHub, Slack, Stripe, Google, and Vercel tokens; JWTs; private keys; local paths; personal email): no hits
- [x] No absolute local paths or usernames in tracked files
- [x] No build output, screenshots of private data, logs, or env files tracked. The one tracked `.env.worker` is an empty validation fixture.
- [x] Demo placeholders (`change-me`) are fake and never rendered (tested)
- [x] Bundled libraries are `dependencies`; test tools are `devDependencies`

### Quality gates (run on the production build)
- [x] Unit tests: 171 of 171 (Vitest, 8 files)
- [x] `tsc --noEmit` (strict): clean
- [x] `next build`: static prerender succeeds
- [x] UI browser checks: 56 of 56 (desktop 1440, mobile 390, keyboard, reduced motion)
- [x] Fix-preview end-to-end: 63 of 63 (both corrections; new-risk scenario; editor isolation; discard, cancel, apply, undo; redaction; mobile)
- [x] Accessibility: axe-core WCAG 2.1 A/AA plus best practice, 8 UI states, 0 violations
- [x] Privacy: 12 same-origin requests on load, 0 requests while editing, 0 to any other origin
- [ ] Real screen reader test (NVDA, VoiceOver): **not done; no screen reader available**
- [ ] Docker ground truth (`validation/run.mjs`, 13 checks): **prepared, not yet run**. Needs the CI job after the first push.
- [ ] CI workflow (`.github/workflows/ci.yml`): **prepared, not yet run**

### Docs
- [x] README: problem, scenarios, comparison, fix preview, confirmed vs inferred, run/test/build, features and limits, privacy, Kiro, safety notice
- [x] `docs/ARCHITECTURE.md`
- [x] `.kiro/KIRO_USAGE.md` reviewed for accuracy, including Kiro features that were *not* used

## Deploying to Vercel

1. Push the repository to GitHub, public or private.
2. In Vercel, choose **Add New → Project** and import the repository.
3. Vercel detects Next.js. Keep the defaults: install `npm install`, build `npm run build`, output managed by Next.js. Pick Node.js 20.x or 22.x (`engines.node` is `>=20.9.0`).
4. No environment variables are required. Do not add any secrets; the app has no server-side code.
5. Deploy. Afterwards, open the URL and run the browser checks against it:
   `node scripts/smoke.mjs https://<your-app>.vercel.app` (and `smoke-fix.mjs` and `a11y.mjs` the same way).

Note: `next/font/google` downloads fonts at build time, so builds need network access (Vercel has it). The deployed site serves fonts itself.

## Remaining blockers before publishing

1. **Copyright holder.** `LICENSE` says `prithvirz` (the Git author name). Replace it with your preferred legal name if needed.
2. **First CI run.** Push to a GitHub repository and confirm that both workflows pass, especially `Compose validation (Docker)`, which is the only real-Docker check. Until it runs, the Docker expectations in `validation/expected.json` are reasoned from Compose's documented behavior, not observed.
3. **Screen reader.** Run a short pass with NVDA (Windows) or VoiceOver (macOS). Automated checks cannot confirm reading order or announcements.
4. **Kiroween rules.** Confirm the current submission requirements (repository visibility, `.kiro/` placement, video or blog, category tags) on the official Kiroween 2026 page; they were not checked here.

## Known limitations (also in the README)
- Static analysis only. No `include`, `extends`, multi-file, interpolation, or profile resolution. Images, code, and env values are never inspected.
- Fix preview supports two correction types. Undo covers only the most recent Apply.
- Browser scripts need a locally installed Edge or Chrome (`PM_BROWSER_CHANNEL`).
