# Requirements: Milestone 1, Comparison Engine

Format: EARS ("WHEN ... THE SYSTEM SHALL ...").

## R1 Input
1.1 THE SYSTEM SHALL accept BEFORE and AFTER Docker Compose YAML in two side-by-side editors.
1.2 WHEN YAML is malformed, empty, not a mapping, lacks `services`, has duplicate keys, exceeds 512 KiB, or exceeds the alias limit, THE SYSTEM SHALL return diagnostics and no findings, and SHALL NOT throw.
1.3 THE SYSTEM SHALL treat input as data only. It SHALL NOT execute YAML tags, scripts, or Docker commands, and SHALL NOT send input over the network.

## R2 Normalization
2.1 THE SYSTEM SHALL normalize services, networks, volumes, ports, and dependencies (`depends_on` list and map forms, `links`, `network_mode: service:`).
2.2 WHEN a service has no `networks` key, THE SYSTEM SHALL attach it to the implicit `default` network.
2.3 THE SYSTEM SHALL identify real networks by top-level `name:` / `external:` so that renamed keys for the same network are not reported as changes.
2.4 THE SYSTEM SHALL parse short and long port syntax, host IPs (including IPv6), protocols, and equal-length ranges. Interpolated or unsupported entries SHALL be marked unresolved and excluded from comparison with a warning.
2.5 THE SYSTEM SHALL resolve YAML anchors and merge keys.
2.6 WHEN `include` or `extends` is present, THE SYSTEM SHALL warn that results may be incomplete.

## R3 Risk detection
3.1 network-lost: WHEN two services in both versions shared a network in BEFORE and share none in AFTER, THE SYSTEM SHALL report a finding. Severity SHALL depend on whether a declared relationship (`depends_on`, `links`, `network_mode`) remains.
3.2 dependency-dangling: WHEN AFTER references a service that is not defined and BEFORE did not already have the same dangling reference, THE SYSTEM SHALL report it, with a rename hint when an added service has the same image or build context.
3.3 ports: THE SYSTEM SHALL report removed published host ports, changed host ports, changed container ports, and loopback-to-all-interfaces exposure changes. Published ports SHALL NOT be treated as service-to-service connectivity.
3.4 env-required-removed: GIVEN a policy, WHEN a required variable was declared in BEFORE and is not declared in AFTER, THE SYSTEM SHALL report it, with lower confidence when `env_file` could supply it.
3.5 THE SYSTEM SHALL also report services attached to an undefined network.

## R4 Findings
4.1 Each finding SHALL contain: severity, affected service, before/after evidence, reason, affected relationships, and confidence with explicit uncertainty.
4.2 Each finding SHALL separate `confirmedChange` (fact) from `possibleConsequence` (phrased as a possibility) and state its `basis` (compose-validation, inferred, or policy).
4.3 THE SYSTEM SHALL NOT claim certainty about runtime outcomes.

## R5 Privacy
5.1 THE SYSTEM SHALL NOT retain environment values or build args in the normalized model.
5.2 Free-form strings entering evidence or diagnostics SHALL pass through redaction (URL credentials, sensitive assignments, long opaque tokens).

## R6 Examples and tests
6.1 THE SYSTEM SHALL ship three realistic scenarios, each with an exact expected finding set.
6.2 Automated tests SHALL cover normal, faulty, and edge cases and run with `npm test`.
