"use client";

import type { Finding } from "@/lib/compose/types";
import { SEVERITY_RANK } from "@/lib/viz/graph";
import type { Highlight } from "@/lib/viz/highlight";
import type { ViewGraph, ViewNode } from "@/lib/viz/view";
import { nodeBadges, severityVisual } from "@/lib/viz/visuals";
import { NetworkTagChip } from "./GraphCanvas";

interface Props {
  graph: ViewGraph;
  findings: Finding[];
  highlight: Highlight | null;
  selectedId: string | null;
  onSelectNode: (id: string) => void;
  onSelectEdge: (id: string) => void;
}

const rank = (n: ViewNode) => (n.risk ? SEVERITY_RANK[n.risk] + 1 : 0);

/** Compact service-and-risk list: the default mobile view, where a graph is too small to read. */
export function RiskList({ graph, findings, highlight, selectedId, onSelectNode, onSelectEdge }: Props) {
  const relationships = graph.edges.filter((e) => e.visual === "broken" || e.visual === "at-risk" || e.visual === "restored");
  const services = graph.nodes
    .filter((n) => n.kind === "service")
    .sort((a, b) => rank(b) - rank(a) || Number(b.visual !== "steady") - Number(a.visual !== "steady") || a.label.localeCompare(b.label));

  return (
    <div className="space-y-4 p-3">
      {relationships.length > 0 && (
        <section aria-labelledby="rl-rel">
          <h3 id="rl-rel" className="mb-1.5 text-[11px] font-semibold tracking-[0.14em] text-veil uppercase">
            Affected relationships
          </h3>
          <ul className="space-y-1.5">
            {relationships.map((e) => {
              const broken = e.visual === "broken";
              const restored = e.visual === "restored";
              return (
                <li key={e.id}>
                  <button
                    type="button"
                    onClick={() => onSelectEdge(e.id)}
                    aria-pressed={selectedId === e.id}
                    className={`flex min-h-11 w-full items-center gap-2 rounded-lg border px-3 py-2 text-left ${restored ? "border-spectral/50 bg-spectral/[0.07]" : broken ? "border-blood/45 bg-blood/[0.06]" : "border-ember/40 bg-ember/[0.05]"}`}
                  >
                    <span className="font-mono text-sm text-bone">{e.source.slice(4)}</span>
                    <span aria-hidden="true" className={restored ? "text-spectral" : broken ? "text-blood" : "text-ember"}>
                      {restored ? "──✓──" : broken ? "─✕─" : "┄!┄"}
                    </span>
                    <span className="font-mono text-sm text-bone">{e.target.slice(4)}</span>
                    <span className={`ml-auto text-right text-xs ${restored ? "text-spectral" : broken ? "text-blood" : "text-ember"}`}>
                      {restored ? "restored in preview" : broken ? "severed" : "possibly affected"}
                      <span className="block text-[11px] text-mist">{e.label}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section aria-labelledby="rl-svc">
        <h3 id="rl-svc" className="mb-1.5 text-[11px] font-semibold tracking-[0.14em] text-veil uppercase">
          Services
        </h3>
        <ul className="space-y-1.5">
          {services.map((n) => {
            const ghost = n.visual === "removed" || n.visual === "missing";
            const badges = nodeBadges(n.visual, n.risk, n.unknowns.length > 0, n.danglingTarget, n.changeKinds);
            const own = findings.filter((f) => n.findingIds.includes(f.id) && f.severity !== "info");
            const dim = highlight !== null && !highlight.ids.has(n.id);
            const accent = n.risk && n.risk !== "info" ? severityVisual(n.risk).color : undefined;
            return (
              <li key={n.id}>
                <button
                  type="button"
                  onClick={() => onSelectNode(n.id)}
                  aria-pressed={selectedId === n.id}
                  className={`relative block min-h-11 w-full rounded-lg border px-3 py-2 text-left transition-opacity ${ghost ? "pm-ghost border-dashed border-veil/50" : "border-seam bg-slab/70"} ${dim ? "opacity-40" : ""}`}
                  style={accent ? { borderLeft: `3px solid ${accent}` } : undefined}
                >
                  <span className="flex items-center gap-2">
                    <span aria-hidden="true" className={ghost ? "text-veil" : n.visual === "added" ? "text-spectral" : "text-violet"}>
                      {ghost ? "☽" : n.visual === "added" ? "✦" : "⬡"}
                    </span>
                    <span className={`font-mono text-sm font-semibold ${ghost ? "text-mist" : "text-bone"}`}>{n.label}</span>
                    {own.length > 0 && <span className="ml-auto text-xs text-mist">{own.length} finding{own.length === 1 ? "" : "s"}</span>}
                  </span>
                  {(n.networks.length > 0 || n.networkModeLabel) && (
                    <span className="mt-1.5 flex flex-wrap gap-1">
                      {n.networks.map((t) => (
                        <NetworkTagChip key={t.id} tag={t} emphasis={dim ? undefined : highlight?.networks.get(t.id)} />
                      ))}
                      {n.networkModeLabel && <span className="font-mono text-[10px] text-violet">{n.networkModeLabel}</span>}
                    </span>
                  )}
                  {badges.length > 0 && (
                    <span className="mt-1.5 flex flex-wrap gap-1">
                      {badges.map((b) => (
                        <span
                          key={b.text}
                          className="rounded border border-seam px-1.5 py-px text-[10.5px] text-mist"
                          style={b.color ? { color: b.color, borderColor: `${b.color}70` } : undefined}
                        >
                          {b.text}
                        </span>
                      ))}
                    </span>
                  )}
                  {n.unknowns.length > 0 && <span className="pm-fog" aria-hidden="true" />}
                </button>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
