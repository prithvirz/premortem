"use client";

import type { AnalysisReport } from "@/lib/compose/analyze";
import type { Finding, Relationship } from "@/lib/compose/types";
import type { GraphModel, ViewMode } from "@/lib/viz/graph";
import type { ReportSummary } from "@/lib/viz/summary";
import { EDGE_KIND_LABEL, severityVisual } from "@/lib/viz/visuals";
import { BasisTag, SectionLabel, SeverityBadge, basisHint } from "./ui";

export type Selection = { kind: "finding" | "node" | "edge"; id: string } | null;
type OkReport = Extract<AnalysisReport, { ok: true }>;

interface Props {
  report: OkReport;
  model: GraphModel;
  summary: ReportSummary;
  mode: ViewMode;
  selection: Selection;
  onSelect: (s: Selection) => void;
  onFocus: (nodeIds: string[]) => void;
}

const STATIC_LIMITS =
  "PreMortem reads only the two Compose files. It cannot see application code, images, env_file contents, secrets, host firewalls, or what actually runs.";

const REL_STATUS: Record<Relationship["status"], { label: string; cls: string; glyph: string }> = {
  broken: { label: "Broken in configuration", cls: "text-blood", glyph: "✕" },
  "at-risk": { label: "Possibly affected", cls: "text-ember", glyph: "!" },
  intact: { label: "Intact", cls: "text-spectral", glyph: "✓" },
  unaffected: { label: "Not affected", cls: "text-spectral", glyph: "✓" },
};

function FindingButton({ f, onSelect }: { f: Finding; onSelect: (s: Selection) => void }) {
  return (
    <button
      type="button"
      onClick={() => onSelect({ kind: "finding", id: f.id })}
      className="flex w-full items-start gap-2 rounded-lg border border-seam bg-slab/60 px-2.5 py-2 text-left text-sm hover:border-violet/50 hover:bg-slab"
    >
      <SeverityBadge severity={f.severity} compact />
      <span className="leading-snug">{f.title}</span>
    </button>
  );
}

function ServiceLink({ name, onFocus, onSelect }: { name: string; onFocus: (ids: string[]) => void; onSelect: (s: Selection) => void }) {
  return (
    <button
      type="button"
      className="rounded font-mono text-spectral underline decoration-spectral/30 underline-offset-2 hover:decoration-spectral"
      onClick={() => {
        onSelect({ kind: "node", id: `svc:${name}` });
        onFocus([`svc:${name}`]);
      }}
    >
      {name}
    </button>
  );
}

function FindingView({ f, onSelect, onFocus }: { f: Finding; onSelect: (s: Selection) => void; onFocus: (ids: string[]) => void }) {
  const before = f.evidence.filter((e) => e.side === "before");
  const after = f.evidence.filter((e) => e.side === "after");
  return (
    <div className="pm-reveal space-y-5">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <SeverityBadge severity={f.severity} />
          <BasisTag basis={f.basis} />
        </div>
        <h2 className="font-display text-xl leading-tight text-bone">{f.title}</h2>
        <p className="text-sm text-mist">
          Affected service: <ServiceLink name={f.service} onFocus={onFocus} onSelect={onSelect} />
        </p>
      </header>

      <div className="rounded-lg border border-spectral/25 bg-spectral/[0.04] p-3">
        <SectionLabel>
          <span className="text-spectral">■ Confirmed change</span>
        </SectionLabel>
        <p className="text-sm leading-relaxed">{f.confirmedChange}</p>
      </div>

      <div className="rounded-lg border border-ember/25 bg-ember/[0.04] p-3">
        <SectionLabel>
          <span className="text-ember">◇ Possible consequence</span>
        </SectionLabel>
        <p className="text-sm leading-relaxed">{f.possibleConsequence}</p>
        <p className="mt-2 text-xs text-mist">{basisHint(f.basis)}</p>
      </div>

      <div>
        <SectionLabel>Why this is flagged</SectionLabel>
        <p className="text-sm leading-relaxed text-mist">{f.reason}</p>
      </div>

      <div>
        <SectionLabel>Evidence</SectionLabel>
        <div className="grid gap-2 sm:grid-cols-2">
          {[
            ["BEFORE", before],
            ["AFTER", after],
          ].map(([label, items]) => (
            <div key={label as string} className="min-w-0 rounded-lg border border-seam bg-void/70 p-2">
              <div className="mb-1 text-[10px] font-semibold tracking-[0.14em] text-veil">{label as string}</div>
              <ul className="space-y-1.5">
                {(items as Finding["evidence"]).map((e, i) => (
                  <li key={i} className="font-mono text-[11px] leading-snug break-words">
                    <span className="text-veil">{e.path}</span>
                    <br />
                    <span className="text-bone">{e.value}</span>
                  </li>
                ))}
                {(items as Finding["evidence"]).length === 0 && <li className="text-xs text-veil">No evidence on this side.</li>}
              </ul>
            </div>
          ))}
        </div>
      </div>

      {f.relationships.length > 0 && (
        <div>
          <SectionLabel>Affected relationships</SectionLabel>
          <ul className="space-y-1.5">
            {f.relationships.map((r, i) => {
              const s = REL_STATUS[r.status];
              return (
                <li key={i} className="rounded-lg border border-seam bg-slab/50 px-2.5 py-1.5 text-sm">
                  <div className="flex flex-wrap items-center gap-x-2">
                    <ServiceLink name={r.from} onFocus={onFocus} onSelect={onSelect} />
                    <span className="text-veil">→</span>
                    <ServiceLink name={r.to} onFocus={onFocus} onSelect={onSelect} />
                    <span className="font-mono text-[11px] text-veil">{r.type}</span>
                    <span className={`ml-auto text-xs ${s.cls}`}>
                      <span aria-hidden="true">{s.glyph} </span>
                      {s.label}
                    </span>
                  </div>
                  {r.note && <p className="mt-0.5 text-xs text-mist">{r.note}</p>}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className="rounded-lg border border-bile/25 bg-bile/[0.04] p-3">
        <SectionLabel>
          <span className="text-bile">? Confidence: {f.confidence.level}. Cannot be determined statically</span>
        </SectionLabel>
        <ul className="list-disc space-y-1 pl-4 text-sm text-mist">
          {f.confidence.uncertainty.map((u, i) => (
            <li key={i}>{u}</li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-veil">{STATIC_LIMITS}</p>
      </div>
    </div>
  );
}

const NODE_STATE_TEXT: Record<string, string> = {
  steady: "Unchanged",
  changed: "Changed in AFTER",
  added: "Added in AFTER",
  removed: "Removed in AFTER",
  missing: "Referenced but not defined",
};

function nodeState(n: GraphModel["nodes"][number], mode: ViewMode): string {
  if (!n.inBefore && !n.inAfter) return NODE_STATE_TEXT.missing!;
  if (!n.inAfter) return n.ghostAfter ? "Removed in AFTER but still referenced" : NODE_STATE_TEXT.removed!;
  if (!n.inBefore) return mode === "before" ? "Not present in BEFORE" : NODE_STATE_TEXT.added!;
  return n.changed ? NODE_STATE_TEXT.changed! : NODE_STATE_TEXT.steady!;
}

function NodeView({ id, model, report, mode, onSelect, onFocus }: { id: string; model: GraphModel; report: OkReport; mode: ViewMode; onSelect: (s: Selection) => void; onFocus: (ids: string[]) => void }) {
  const n = model.nodes.find((x) => x.id === id);
  if (!n) return <p className="text-sm text-mist">This item is not in the current analysis.</p>;
  const own = report.findings.filter((f) => n.findingIds.includes(f.id));
  const involved = report.findings.filter((f) => n.involvedIds.includes(f.id) && !n.findingIds.includes(f.id));

  if (n.kind === "network") {
    const members = model.edges.filter((e) => e.target === n.id && e.kind === "membership");
    const list = (pred: (e: (typeof members)[number]) => boolean) => members.filter(pred).map((e) => e.source.slice(4));
    return (
      <div className="pm-reveal space-y-4">
        <h2 className="font-display text-xl">≋ {n.label}</h2>
        <p className="text-sm text-mist">
          Docker network{n.external ? " (external, managed outside this project)" : ""}
          {n.implicit ? ". Compose creates it automatically for services that do not list `networks`." : "."}
        </p>
        {[
          ["Members in BEFORE", list((e) => e.presence.before)],
          ["Members in AFTER", list((e) => e.presence.after)],
        ].map(([label, names]) => (
          <div key={label as string}>
            <SectionLabel>{label as string}</SectionLabel>
            <p className="font-mono text-sm">{(names as string[]).length ? (names as string[]).join(", ") : "none"}</p>
          </div>
        ))}
        <p className="text-xs text-veil">Containers can reach each other by service name only through a shared network.</p>
      </div>
    );
  }

  return (
    <div className="pm-reveal space-y-4">
      <header>
        <h2 className="font-display text-xl">
          <span className="font-mono">{n.label}</span>
        </h2>
        <p className="text-sm text-mist">
          {nodeState(n, mode)}
          {n.image ? (
            <>
              {" · "}
              <span className="font-mono text-xs">{n.image}</span>
            </>
          ) : null}
        </p>
      </header>
      {n.changes.length > 0 && (
        <div>
          <SectionLabel>Confirmed changes</SectionLabel>
          <ul className="space-y-1 font-mono text-[11.5px]">
            {n.changes.map((c) => (
              <li key={c} className="rounded border border-seam bg-void/60 px-2 py-1 break-words">
                {c}
              </li>
            ))}
          </ul>
        </div>
      )}
      {(n.ports.before.length > 0 || n.ports.after.length > 0) && (
        <div className="grid grid-cols-2 gap-2 font-mono text-[11.5px]">
          <div>
            <SectionLabel>Published BEFORE</SectionLabel>
            {n.ports.before.join(", ") || "none"}
          </div>
          <div>
            <SectionLabel>Published AFTER</SectionLabel>
            {n.ports.after.join(", ") || "none"}
          </div>
        </div>
      )}
      <div>
        <SectionLabel>Findings on this service</SectionLabel>
        {own.length ? <div className="space-y-1.5">{own.map((f) => <FindingButton key={f.id} f={f} onSelect={onSelect} />)}</div> : <p className="text-sm text-mist">None.</p>}
      </div>
      {involved.length > 0 && (
        <div>
          <SectionLabel>Involved in</SectionLabel>
          <div className="space-y-1.5">
            {involved.map((f) => (
              <FindingButton key={f.id} f={f} onSelect={onSelect} />
            ))}
          </div>
        </div>
      )}
      {n.unknowns.length > 0 && (
        <div className="rounded-lg border border-bile/25 bg-bile/[0.04] p-3">
          <SectionLabel>
            <span className="text-bile">? Not analyzed</span>
          </SectionLabel>
          <ul className="list-disc space-y-1 pl-4 text-sm text-mist">
            {n.unknowns.map((u) => (
              <li key={u}>{u}</li>
            ))}
          </ul>
        </div>
      )}
      <button type="button" onClick={() => onFocus([n.id])} className="text-xs text-spectral hover:underline">
        Center in graph
      </button>
    </div>
  );
}

function EdgeView({ id, model, report, onSelect, onFocus }: { id: string; model: GraphModel; report: OkReport; onSelect: (s: Selection) => void; onFocus: (ids: string[]) => void }) {
  const e = model.edges.find((x) => x.id === id);
  if (!e) return <p className="text-sm text-mist">This relationship is not in the current analysis.</p>;
  const fs = report.findings.filter((f) => e.findingIds.includes(f.id));
  const from = e.source.slice(4);
  const to = e.target.slice(4);
  const presence = e.presence.before && e.presence.after ? "Declared in BEFORE and AFTER" : e.presence.before ? "Declared in BEFORE only (removed)" : e.kind === "lost-network" ? "Not a declared relationship" : "Declared in AFTER only (added)";
  return (
    <div className="pm-reveal space-y-4">
      <h2 className="font-display text-xl">{EDGE_KIND_LABEL[e.kind]}</h2>
      <p className="text-sm">
        <ServiceLink name={from} onFocus={onFocus} onSelect={onSelect} /> <span className="text-veil">→</span>{" "}
        {e.kind === "membership" ? <span className="font-mono">{model.nodes.find((n) => n.id === e.target)?.label}</span> : <ServiceLink name={to} onFocus={onFocus} onSelect={onSelect} />}
      </p>
      <p className="text-sm text-mist">{presence}</p>
      {e.kind === "lost-network" && (
        <p className="text-sm text-mist">
          These services shared a network in BEFORE and share none in AFTER. Neither file declares that they talk to each other, so this is shown as isolation, not as a failure.
        </p>
      )}
      {e.risk && (
        <p className="text-sm">
          Status: <span className={e.risk === "broken" ? "text-blood" : e.risk === "at-risk" ? "text-ember" : "text-violet"}>{e.riskLabel}</span>
        </p>
      )}
      <div>
        <SectionLabel>Related findings</SectionLabel>
        {fs.length ? <div className="space-y-1.5">{fs.map((f) => <FindingButton key={f.id} f={f} onSelect={onSelect} />)}</div> : <p className="text-sm text-mist">No findings involve this relationship.</p>}
      </div>
    </div>
  );
}

function Overview({ report, summary, onSelect }: { report: OkReport; summary: ReportSummary; onSelect: (s: Selection) => void }) {
  return (
    <div className="pm-reveal space-y-5">
      <div>
        <h2 className="font-display text-xl">Investigation overview</h2>
        <p className="mt-1 text-sm text-mist">Select a service, a relationship, a finding, or a timeline step to see its evidence.</p>
      </div>
      <div>
        <SectionLabel>Supported conclusions</SectionLabel>
        <ul className="space-y-1.5 text-sm">
          <li>
            <span className="font-mono text-blood">{summary.validationFailures}</span> finding{summary.validationFailures === 1 ? "" : "s"} where Compose is expected to reject the AFTER file.
          </li>
          <li>
            <span className="font-mono text-ember">{summary.inferred}</span> inferred possibilit{summary.inferred === 1 ? "y" : "ies"} from topology and ports.
          </li>
          <li>
            <span className="font-mono text-violet">{summary.policyFindings}</span> policy violation{summary.policyFindings === 1 ? "" : "s"}.
          </li>
        </ul>
      </div>
      <div>
        <SectionLabel>All findings</SectionLabel>
        {report.findings.length ? (
          <div className="space-y-1.5">
            {report.findings.map((f) => (
              <FindingButton key={f.id} f={f} onSelect={onSelect} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-mist">No supported risks detected between these versions. That is not a guarantee the deployment will succeed.</p>
        )}
      </div>
      <div className="rounded-lg border border-bile/25 bg-bile/[0.04] p-3">
        <SectionLabel>
          <span className="text-bile">? Unknowns</span>
        </SectionLabel>
        {summary.unknowns.length > 0 && (
          <ul className="mb-2 list-disc space-y-1 pl-4 text-sm text-bone">
            {summary.unknowns.map((u) => (
              <li key={u}>{u}</li>
            ))}
          </ul>
        )}
        <ul className="list-disc space-y-1 pl-4 text-sm text-mist">
          {summary.limitations.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function Inspector(props: Props) {
  const { selection, report, model, summary, mode, onSelect, onFocus } = props;
  const finding = selection?.kind === "finding" ? report.findings.find((f) => f.id === selection.id) : undefined;
  return (
    <div className="space-y-3">
      {selection && (
        <button type="button" onClick={() => onSelect(null)} className="text-xs text-veil hover:text-bone">
          ← Overview
        </button>
      )}
      {!selection && <Overview report={report} summary={summary} onSelect={onSelect} />}
      {finding && <FindingView key={finding.id} f={finding} onSelect={onSelect} onFocus={onFocus} />}
      {selection?.kind === "node" && <NodeView key={selection.id} id={selection.id} model={model} report={report} mode={mode} onSelect={onSelect} onFocus={onFocus} />}
      {selection?.kind === "edge" && <EdgeView key={selection.id} id={selection.id} model={model} report={report} onSelect={onSelect} onFocus={onFocus} />}
      {selection?.kind === "finding" && !finding && <p className="text-sm text-mist">That finding no longer exists after your edit.</p>}
      <span className="sr-only">{finding ? `${severityVisual(finding.severity).label} finding selected` : ""}</span>
    </div>
  );
}
