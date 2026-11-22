"use client";

import { useEffect, useRef } from "react";
import type { TimelineStep } from "@/lib/viz/timeline";
import { SeverityBadge } from "./ui";

interface Props {
  steps: TimelineStep[];
  active: number | null;
  onActivate: (index: number | null) => void;
  onInspect: (step: TimelineStep) => void;
  onGoTo: (step: TimelineStep) => void;
}

export function Timeline({ steps, active, onActivate, onInspect, onGoTo }: Props) {
  const listRef = useRef<HTMLOListElement>(null);

  useEffect(() => {
    if (active === null) return;
    const el = listRef.current?.querySelector<HTMLElement>(`[data-step="${active}"]`);
    el?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }, [active]);

  if (steps.length === 0) {
    return <p className="px-4 py-3 text-sm text-mist">No configuration differences were found between BEFORE and AFTER.</p>;
  }

  const go = (i: number) => onActivate(Math.max(0, Math.min(steps.length - 1, i)));
  const firstConsequence = steps.findIndex((s) => s.phase === "consequence");

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 border-b border-seam px-4 py-2.5">
        <h2 className="font-display text-lg">Deployment change story</h2>
        <span className="text-xs text-veil">
          {active === null ? `${steps.length} steps` : `Step ${active + 1} of ${steps.length}`}
        </span>
        <div className="ml-auto flex gap-1.5">
          <button type="button" className="min-h-9 rounded-md border border-seam px-3 py-1 text-xs hover:bg-slab disabled:opacity-40" onClick={() => go((active ?? 0) - 1)} disabled={active === null || active === 0}>
            <span aria-hidden="true">← </span>Previous step
          </button>
          <button type="button" className="min-h-9 rounded-md border border-violet/50 bg-violet/10 px-3 py-1 text-xs text-violet hover:bg-violet/20 disabled:opacity-40" onClick={() => go(active === null ? 0 : active + 1)} disabled={active === steps.length - 1}>
            {active === null ? "Start the change story" : "Next step"}
            <span aria-hidden="true">{active === null ? " ▸" : " →"}</span>
          </button>
          {active !== null && (
            <button type="button" className="min-h-9 rounded-md border border-seam px-3 py-1 text-xs text-mist hover:bg-slab" onClick={() => onActivate(null)}>
              Reset
            </button>
          )}
        </div>
      </div>
      <ol ref={listRef} className="pm-scroll max-h-[340px] space-y-1 overflow-y-auto p-2" aria-label="Deployment change story steps">
        {steps.map((s, i) => {
          const isActive = active === i;
          const revealed = active === null || i <= active;
          return (
            <li key={s.id} data-step={i}>
              {i === 0 && <PhaseHeader text="What changed in the files" sub="Confirmed by comparing BEFORE and AFTER" />}
              {i === firstConsequence && <PhaseHeader text="What it might break" sub="Findings from the rules, most severe first" />}
              <div className={`rounded-lg border transition-colors ${isActive ? "border-violet/60 bg-violet/[0.07]" : "border-transparent hover:border-seam"} ${revealed ? "" : "opacity-45"}`}>
                <button type="button" className="flex w-full items-start gap-3 px-3 py-2 text-left" onClick={() => onActivate(i)} aria-current={isActive ? "step" : undefined}>
                  <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border font-mono text-[10px] ${s.phase === "change" ? "border-spectral/50 text-spectral" : "border-ember/50 text-ember"}`}>{i + 1}</span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      {s.severity && <SeverityBadge severity={s.severity} compact />}
                      <span className="text-sm leading-snug">{s.title}</span>
                    </span>
                    {isActive && <span className="mt-1 block text-xs leading-relaxed text-mist">{s.detail}</span>}
                  </span>
                </button>
                {isActive && (
                  <div className="pm-reveal space-y-2 px-3 pb-3 pl-11">
                    <ul className="space-y-0.5 font-mono text-[11px] text-mist">
                      {s.evidence.slice(0, 6).map((e, k) => (
                        <li key={k} className="break-words">
                          {e}
                        </li>
                      ))}
                      {s.evidence.length > 6 && <li className="text-veil">+{s.evidence.length - 6} more in the inspector</li>}
                    </ul>
                    <div className="flex flex-wrap gap-2">
                      {s.nodeIds.length > 0 && (
                        <button type="button" onClick={() => onGoTo(s)} className="min-h-8 rounded-md border border-spectral/40 px-2.5 py-1 text-xs text-spectral hover:bg-spectral/10">
                          Go to {s.nodeIds.length === 1 ? s.nodeIds[0]!.replace(/^(svc|net):(project:|named:|external:)?/, "") : "affected services"}
                        </button>
                      )}
                      {(s.findingId || s.relatedFindingIds.length > 0) && (
                        <button type="button" onClick={() => onInspect(s)} className="min-h-8 rounded-md border border-ember/40 px-2.5 py-1 text-xs text-ember hover:bg-ember/10">
                          {s.findingId ? "Inspect evidence" : `View ${s.relatedFindingIds.length} related finding${s.relatedFindingIds.length === 1 ? "" : "s"}`}
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function PhaseHeader({ text, sub }: { text: string; sub: string }) {
  return (
    <div className="px-3 pt-2 pb-1">
      <div className="text-[11px] font-semibold tracking-[0.14em] text-veil uppercase">{text}</div>
      <div className="text-[11px] text-veil/80">{sub}</div>
    </div>
  );
}
