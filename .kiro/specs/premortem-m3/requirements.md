# Milestone 3: What-if Fix Preview

Flow: discover a risk → understand the evidence → preview a possible correction → reanalyze → see what changed.

## Requirements (EARS)
- R1 WHEN a `network-lost` finding still has a declared relationship (severity above info), THE SYSTEM SHALL offer attaching one service to a network the other is on, recommending the dependent joining the target's network.
- R2 WHEN the relationship was also removed, or no relationship is declared, THE SYSTEM SHALL decline and say the separation may be intentional.
- R3 WHEN a `dependency-dangling` target was defined in BEFORE and an added service shares its image or build context, THE SYSTEM SHALL offer retargeting every reference to that service. The match SHALL be disclosed as a hint, and preview SHALL require explicit confirmation of the target.
- R4 WHEN there is no candidate, or several, THE SYSTEM SHALL decline, or list all candidates without recommending one.
- R5 THE SYSTEM SHALL decline automatic edits when the file or the edited service uses `include`, `extends`, YAML anchors, aliases, merge keys, interpolation, `network_mode` conflicts, multiple documents, or would create duplicates. It SHALL explain why.
- R6 Patches SHALL be minimal text splices that preserve comments, quoting, line endings, and unrelated lines byte for byte. Each patch SHALL be re-parsed and compared semantically with the intended change, or rejected.
- R7 A preview SHALL reanalyze BEFORE plus the proposed AFTER with the existing engine and report cleared, remaining, and new findings by finding id. A warning SHALL count as cleared only if the engine no longer reports it.
- R8 Verdict wording SHALL be "Configuration warning cleared after reanalysis" (or "remains") and SHALL NOT claim the deployment is fixed or safe.
- R9 Previews SHALL NOT mutate BEFORE or AFTER. Editing either file SHALL discard a stale preview. Discard SHALL restore the prior view.
- R10 Applying SHALL require an explicit second confirmation, change only the AFTER editor, and offer a single undo.
- R11 The graph SHALL show the proposed AFTER on the current layout, drawing restored relationships and proposed network memberships distinctly, with a Current/Proposed comparison toggle. Animation SHALL respect reduced motion.
- R12 Diff output SHALL be redacted. Policy and port findings SHALL NOT get automatic fixes (no invented values).
- R13 WHEN a retarget replacement does not share a network with a dependent, THE SYSTEM SHALL warn prominently, because the network rule does not compare services absent from BEFORE.
