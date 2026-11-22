import type { Severity } from "@/lib/compose/types";
import type { ReportSummary } from "@/lib/viz/summary";
import { severityVisual } from "@/lib/viz/visuals";

const ORDER: Severity[] = ["critical", "high", "medium", "low", "info"];

export function SummaryStrip({ summary, onShowUnknowns }: { summary: ReportSummary; onShowUnknowns: () => void }) {
  const c = summary.changes;
  const verdict =
    summary.validationFailures > 0
      ? { text: "Compose is expected to reject the AFTER file", cls: "text-blood" }
      : summary.affectedRelationships > 0
        ? { text: "Declared relationships may break", cls: "text-ember" }
        : summary.counts.high + summary.counts.critical > 0
          ? { text: "High-severity changes need review", cls: "text-ember" }
        : summary.total > 0
          ? { text: "Changes worth reviewing", cls: "text-bile" }
          : { text: "No supported risks detected", cls: "text-spectral" };

  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3" role="status" aria-label="Analysis summary">
      <div className="min-w-0">
        <div className="text-[11px] font-semibold tracking-[0.14em] text-veil uppercase">Verdict</div>
        <div className={`font-display text-lg leading-tight ${verdict.cls}`}>{verdict.text}</div>
      </div>
      <ul className="flex flex-wrap gap-1.5" aria-label="Findings by severity">
        {ORDER.map((s) => {
          const v = severityVisual(s);
          const n = summary.counts[s];
          return (
            <li key={s} className={`flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs ${n ? "" : "opacity-35"}`} style={{ borderColor: n ? `${v.color}55` : undefined, color: n ? v.color : undefined }}>
              <span aria-hidden="true">{v.glyph}</span>
              <span className="font-mono">{n}</span>
              <span>{v.label}</span>
            </li>
          );
        })}
      </ul>
      <div className="text-xs text-mist">
        <span className="font-mono text-bone">{c.servicesChanged}</span> changed · <span className="font-mono text-bone">{c.servicesAdded}</span> added · <span className="font-mono text-bone">{c.servicesRemoved}</span> removed services
        {c.networksChanged > 0 && (
          <>
            {" "}
            · <span className="font-mono text-bone">{c.networksChanged}</span> network changes
          </>
        )}
      </div>
      <button type="button" onClick={onShowUnknowns} className="ml-auto rounded-md border border-bile/40 px-2 py-1 text-xs text-bile hover:bg-bile/10">
        ? {summary.unknowns.length > 0 ? `${summary.unknowns.length} unresolved + ` : ""}static-analysis limits
      </button>
    </div>
  );
}
