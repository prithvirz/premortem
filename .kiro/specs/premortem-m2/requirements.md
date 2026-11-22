# Requirements: Milestone 2, Haunted Infrastructure Observatory

## R1 Graph
1.1 THE SYSTEM SHALL render services, networks, and declared relationships (`depends_on`, `links`, `network_mode`) with React Flow.
1.2 Network membership SHALL be drawn differently from service dependencies.
1.3 Nodes SHALL show added, removed, changed, undefined ("ghost"), and unresolved states with text badges, not color alone.
1.4 WHEN a node, edge, or edge label is clicked, or selected with Enter/Space, THE SYSTEM SHALL open its evidence.

## R2 BEFORE / AFTER
2.1 THE SYSTEM SHALL offer Before, Changes (overlay), and After views with identical node positions.
2.2 Risk SHALL appear only in Changes/After views, and only for relationships that a finding marks `broken` or `at-risk`.
2.3 Undeclared isolation (info findings) SHALL NOT be drawn as a failure. It is hidden until its finding or service is selected.
2.4 Port and policy findings SHALL badge nodes and SHALL NOT draw broken edges.

## R3 Timeline
3.1 Steps SHALL list confirmed file changes first, then findings by severity, each built from engine output.
3.2 Each step SHALL show its evidence lines, link to the finding, and offer "Go to" for affected services.

## R4 Inspector
4.1 A finding view SHALL separate the confirmed change from the possible consequence and show basis, severity, confidence, uncertainty, before/after evidence, and relationships.
4.2 THE SYSTEM SHALL state what static Compose analysis cannot determine, both per finding and globally.
4.3 With nothing selected, THE SYSTEM SHALL show supported conclusions, all findings, unknowns (engine diagnostics), and limitations.

## R5 Scenarios, a11y, safety
5.1 The three scenarios SHALL be one click away and labeled by risk kind.
5.2 Layout SHALL work at 390 px width without horizontal overflow. Controls SHALL be keyboard operable. `prefers-reduced-motion` SHALL disable animation.
5.3 All numbers SHALL come from the engine. No secret value SHALL render outside the editors.
5.4 Malformed input SHALL show an error panel with diagnostics and no graph.
