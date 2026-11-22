import type { Severity } from "@/lib/compose/types";
import type { Headline } from "@/lib/viz/headline";
import type { ReportSummary } from "@/lib/viz/summary";
import { severityVisual } from "@/lib/viz/visuals";

const ORDER: Severity[] = ["critical", "high", "medium", "low", "info"];

interface Props {
  summary: ReportSummary;
  headline: Headline | null;
  onOpenHeadline: () => void;
  onShowUnknowns: () => void;
}

/** One-line verdict that names the top risk by service, with neutral zero counts. */
export function Verdict({ summary, headline, onOpenHeadline, onShowUnknowns }: Props) {
  const top = headline ? severityVisual(headline.finding.severity) : null;
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-4 py-2.5" role="status" aria-label="Analysis summary">
      {headline && top ? (
        <button type="button" onClick={onOpenHeadline} className="group flex min-w-0 items-center gap-3 rounded-lg text-left" aria-label={`Top risk: ${headline.text}. ${headline.qualifier}. Open evidence.`}>
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border text-base" style={{ color: top.color, borderColor: `${top.color}66`, background: `${top.color}14` }} aria-hidden="true">
            {top.glyph}
          </span>
          <span className="min-w-0">
            <span className="block font-mono text-[15px] leading-tight font-semibold sm:text-base" style={{ color: top.color }}>
              {headline.text}
            </span>
            <span className="block text-xs text-mist">
              {top.label} · {headline.qualifier}
              {headline.more > 0 && ` · +${headline.more} more`}
              <span className="ml-1 text-spectral group-hover:underline">Evidence →</span>
            </span>
          </span>
        </button>
      ) : (
        <div>
          <div className="font-display text-lg text-spectral">No supported risks detected</div>
          <div className="text-xs text-mist">{summary.total > 0 ? "Only informational context was found." : "This is not a guarantee the deployment will succeed."}</div>
        </div>
      )}

      <ul className="flex flex-wrap gap-1" aria-label="Findings by severity">
        {ORDER.map((s) => {
          const v = severityVisual(s);
          const n = summary.counts[s];
          return (
            <li
              key={s}
              className={`flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] ${n ? "" : "border-seam text-veil/70"}`}
              style={n ? { borderColor: `${v.color}55`, color: v.color } : undefined}
            >
              <span aria-hidden="true">{v.glyph}</span>
              <span className="font-mono">{n}</span>
              <span>{v.label}</span>
            </li>
          );
        })}
      </ul>
      <div className="text-xs text-veil">
        {summary.changes.servicesChanged} changed · {summary.changes.servicesAdded} added · {summary.changes.servicesRemoved} removed
      </div>
      <button type="button" onClick={onShowUnknowns} className="ml-auto min-h-8 rounded-md border border-bile/40 px-2 py-1 text-xs text-bile hover:bg-bile/10">
        ? {summary.unknowns.length > 0 ? `${summary.unknowns.length} unresolved · ` : ""}limits
      </button>
    </div>
  );
}
