# Specs index

Each milestone was briefed by the author, implemented by Kiro, verified, and approved before the next one started. These files record the requirements (EARS style), design, and tasks for each milestone. Later milestones refine earlier ones; where they differ, the later spec and `.kiro/decisions/decisions.md` take precedence.

| Milestone | Scope | Files |
| --- | --- | --- |
| M1 | Comparison engine, three scenarios, tests | [requirements](premortem-m1/requirements.md) · [design](premortem-m1/design.md) · [tasks](premortem-m1/tasks.md) |
| M2 | Observatory UI: graph, BEFORE/AFTER, inspector, timeline | [requirements](premortem-m2/requirements.md) · [design](premortem-m2/design.md) · [tasks](premortem-m2/tasks.md) |
| M2.5 | Signature visuals and UX corrections from a screenshot audit | [requirements and tasks](premortem-m2.5/tasks.md) |
| M3 | What-if Fix Preview | [requirements](premortem-m3/requirements.md) · [design](premortem-m3/design.md) |
| M3.1 | `dependency-unreachable` rule, preview new-risk reporting, a11y and release audit | [requirements and tasks](premortem-m3.1/tasks.md) |
| Release | Open-source readiness, docs, CI, Docker validation | [../../docs/RELEASE.md](../../docs/RELEASE.md) |

Note on process: the author's milestone briefs were the source requirements. Kiro wrote these spec files during each milestone, usually alongside or after the implementation. They document what was built and why; they were not all written before coding started.
