import type { AnalysisReport } from "../compose/analyze";
import type { Diagnostic, Severity } from "../compose/types";

export interface ReportSummary {
  counts: Record<Severity, number>;
  total: number;
  /** Findings Compose itself would reject (static validation). */
  validationFailures: number;
  /** Findings inferred from topology, ports, or policy. These are possibilities. */
  inferred: number;
  policyFindings: number;
  /** Count of broken or at-risk declared relationships across all findings (excludes undeclared isolation). */
  affectedRelationships: number;
  /** Structural counts straight from the diff. */
  changes: { servicesAdded: number; servicesRemoved: number; servicesChanged: number; networksChanged: number };
  /** Things the analysis could not resolve, taken from engine diagnostics. */
  unknowns: string[];
  limitations: string[];
}

export function summarize(report: Extract<AnalysisReport, { ok: true }>): ReportSummary {
  const warn = (side: string, d: Diagnostic[]) => d.filter((x) => x.level !== "info").map((x) => `${side}: ${x.message}`);
  const unknowns = [
    ...warn("BEFORE", report.diagnostics.before),
    ...warn("AFTER", report.diagnostics.after),
    ...warn("Policy", report.diagnostics.policy),
  ];
  return {
    counts: report.counts,
    total: report.findings.length,
    validationFailures: report.findings.filter((f) => f.basis === "compose-validation").length,
    inferred: report.findings.filter((f) => f.basis === "inferred").length,
    policyFindings: report.findings.filter((f) => f.basis === "policy").length,
    affectedRelationships: report.findings
      .filter((f) => f.severity !== "info")
      .flatMap((f) => f.relationships)
      .filter((r) => r.type !== "network" && (r.status === "broken" || r.status === "at-risk")).length,
    changes: {
      servicesAdded: report.diff.servicesAdded.length,
      servicesRemoved: report.diff.servicesRemoved.length,
      servicesChanged: report.diff.changedServices.length,
      networksChanged: report.diff.networksAdded.length + report.diff.networksRemoved.length,
    },
    unknowns: [...new Set(unknowns)],
    limitations: report.limitations,
  };
}
