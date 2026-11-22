"use client";

import type { Highlight } from "@/lib/viz/highlight";
import type { ViewGraph } from "@/lib/viz/view";

/** All networks in the current view, as selectable chips. Replaces drawing membership curves on the canvas. */
export function NetworkStrip({ graph, highlight, selectedId, onSelect }: { graph: ViewGraph; highlight: Highlight | null; selectedId: string | null; onSelect: (id: string) => void }) {
  const nets = graph.nodes.filter((n) => n.kind === "network");
  if (nets.length === 0) return null;
  const members = (id: string) => graph.edges.filter((e) => e.kind === "membership" && e.target === id);

  return (
    <div className="flex flex-wrap items-center gap-1.5 border-b border-seam px-3 py-2" role="group" aria-label="Networks">
      <span className="mr-1 text-[11px] font-semibold tracking-[0.14em] text-veil uppercase">Networks</span>
      {nets.map((n) => {
        const emphasis = highlight?.networks.get(n.id);
        const dim = highlight !== null && !emphasis;
        const m = members(n.id);
        const count = m.filter((e) => (n.visual === "removed" ? e.presence.before : e.presence.after || e.presence.before)).length;
        const state = n.visual === "added" ? "added" : n.visual === "removed" ? "removed" : "kept";
        const tone =
          state === "added" ? "border-spectral/50 text-spectral" : state === "removed" ? "border-dashed border-veil/60 text-veil" : "border-violet/40 text-violet";
        const ring = emphasis === "lost" ? "ring-2 ring-blood/80" : emphasis === "related" ? "ring-1 ring-spectral/70" : "";
        return (
          <button
            key={n.id}
            type="button"
            onClick={() => onSelect(n.id)}
            aria-pressed={selectedId === n.id}
            data-network-chip={n.id}
            data-emphasis={emphasis ?? "none"}
            className={`min-h-8 rounded-full border bg-void/80 px-2.5 py-1 font-mono text-[11px] transition-opacity ${tone} ${ring} ${dim ? "opacity-35" : ""} ${selectedId === n.id ? "!border-spectral" : ""}`}
            title={`${n.implicit ? "Implicit default network" : n.external ? "External network" : "Network"}, ${state === "kept" ? "present in both" : `${state} in AFTER`}`}
          >
            <span aria-hidden="true">{state === "added" ? "+ " : state === "removed" ? "− " : "≋ "}</span>
            <span className={state === "removed" ? "line-through" : ""}>{n.implicit ? "default" : n.label}</span>
            {n.implicit && <span className="text-veil"> implicit</span>}
            {n.external && <span className="text-veil"> external</span>}
            <span className="ml-1.5 text-veil">{count}</span>
            <span className="sr-only"> members, {state === "kept" ? "unchanged" : state}</span>
            {emphasis === "lost" && <span className="ml-1.5 font-sans text-[9.5px] font-semibold tracking-wide text-blood uppercase">shared · lost</span>}
          </button>
        );
      })}
    </div>
  );
}
