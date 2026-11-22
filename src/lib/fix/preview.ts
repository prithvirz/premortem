import { analyze, type AnalysisInput, type AnalysisReport } from "../compose/analyze";
import { redact } from "../compose/redact";
import type { Finding } from "../compose/types";
import type { FixOption } from "./proposals";

type OkReport = Extract<AnalysisReport, { ok: true }>;

export interface DiffLine {
  kind: "same" | "add" | "del" | "gap";
  /** 1-based line numbers in AFTER / PROPOSED. */
  a?: number;
  b?: number;
  /** Redacted text; secrets never reach the preview. */
  text: string;
}

export interface FixPreview {
  option: FixOption;
  proposedAfter: string;
  report: OkReport;
  targetFindingId: string;
  /** True only if the engine no longer reports the target finding. */
  targetCleared: boolean;
  cleared: Finding[];
  remaining: Finding[];
  introduced: Finding[];
  verdict: string;
  diff: DiffLine[];
}

const MAX_DIFF_LINES = 4000;

/** Line diff (LCS) with one line of context; large files fall back to changed lines only. */
export function lineDiff(a: string, b: string, context = 1): DiffLine[] {
  const A = a.split(/\r?\n/);
  const B = b.split(/\r?\n/);
  const out: DiffLine[] = [];
  if (A.length > MAX_DIFF_LINES || B.length > MAX_DIFF_LINES) {
    const n = Math.max(A.length, B.length);
    for (let i = 0; i < n; i++) {
      if (A[i] === B[i]) continue;
      if (A[i] !== undefined) out.push({ kind: "del", a: i + 1, text: redact(A[i]!) });
      if (B[i] !== undefined) out.push({ kind: "add", b: i + 1, text: redact(B[i]!) });
    }
    return out;
  }
  const dp: number[][] = Array.from({ length: A.length + 1 }, () => new Array<number>(B.length + 1).fill(0));
  for (let i = A.length - 1; i >= 0; i--) for (let j = B.length - 1; j >= 0; j--) dp[i]![j] = A[i] === B[j] ? dp[i + 1]![j + 1]! + 1 : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
  const all: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < A.length || j < B.length) {
    if (i < A.length && j < B.length && A[i] === B[j]) all.push({ kind: "same", a: ++i, b: ++j, text: A[i - 1]! });
    // Prefer deletions first so a changed line reads as old then new.
    else if (i < A.length && (j >= B.length || dp[i + 1]![j]! >= dp[i]![j + 1]!)) all.push({ kind: "del", a: ++i, text: A[i - 1]! });
    else all.push({ kind: "add", b: ++j, text: B[j - 1]! });
  }
  const keep = new Set<number>();
  all.forEach((l, k) => {
    if (l.kind !== "same") for (let d = -context; d <= context; d++) keep.add(k + d);
  });
  let gap = false;
  all.forEach((l, k) => {
    if (keep.has(k)) {
      out.push({ ...l, text: redact(l.text) });
      gap = false;
    } else if (!gap) {
      out.push({ kind: "gap", text: "…" });
      gap = true;
    }
  });
  return out;
}

/**
 * Reanalyze BEFORE against the proposed AFTER. Inputs are strings; nothing is mutated.
 * The verdict is worded from engine output only and never claims the deployment works.
 */
export function previewFix(input: AnalysisInput, current: OkReport, findingId: string, option: FixOption): FixPreview | { error: string } {
  const report = analyze({ ...input, after: option.patchedAfter });
  if (!report.ok) return { error: "The proposed configuration could not be analyzed, so it is not offered." };
  const now = new Set(report.findings.map((f) => f.id));
  const was = new Set(current.findings.map((f) => f.id));
  const cleared = current.findings.filter((f) => !now.has(f.id));
  const remaining = report.findings.filter((f) => was.has(f.id));
  const introduced = report.findings.filter((f) => !was.has(f.id));
  const targetCleared = !now.has(findingId);
  const significantNew = introduced.filter((f) => f.severity !== "info");

  let verdict: string;
  if (!targetCleared) verdict = "The warning remains after reanalysis. This change would not clear it.";
  else if (introduced.length === 0) verdict = "Configuration warning cleared after reanalysis.";
  else
    verdict = `Configuration warning cleared after reanalysis, but ${introduced.length} new finding${introduced.length === 1 ? "" : "s"} appeared${significantNew.length ? "" : " (informational)"}.`;

  return {
    option,
    proposedAfter: option.patchedAfter,
    report,
    targetFindingId: findingId,
    targetCleared,
    cleared,
    remaining,
    introduced,
    verdict,
    diff: lineDiff(input.after, option.patchedAfter),
  };
}
