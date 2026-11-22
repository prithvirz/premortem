"use client";

import { useState } from "react";
import type { ViewMode } from "@/lib/viz/graph";
import type { EdgeVisual } from "@/lib/viz/view";
import { edgeSpec } from "@/lib/viz/visuals";

const ITEMS: { v: EdgeVisual; label: string; glyph: string; modes: ViewMode[] }[] = [
  { v: "steady", label: "Declared dependency", glyph: "→", modes: ["before", "diff", "after"] },
  { v: "broken", label: "Severed in configuration", glyph: "✕", modes: ["diff", "after"] },
  { v: "at-risk", label: "Possibly affected (inferred)", glyph: "!", modes: ["diff", "after"] },
  { v: "added", label: "Added", glyph: "+", modes: ["diff", "after"] },
  { v: "removed", label: "Removed", glyph: "−", modes: ["before", "diff"] },
];

function Sample({ v }: { v: EdgeVisual }) {
  const s = edgeSpec(v, "depends_on");
  if (s.severed) {
    return (
      <svg width="34" height="8" aria-hidden="true">
        <line x1="0" y1="4" x2="12" y2="4" stroke={s.stroke} strokeWidth={s.width} />
        <line x1="22" y1="4" x2="34" y2="4" stroke={s.stroke} strokeWidth={s.width} />
        <circle cx="12" cy="4" r="2.5" fill={s.stroke} />
        <circle cx="22" cy="4" r="2.5" fill={s.stroke} />
      </svg>
    );
  }
  return (
    <svg width="34" height="8" aria-hidden="true">
      <line x1="0" y1="4" x2="34" y2="4" stroke={s.stroke} strokeWidth={s.width} strokeDasharray={s.dash} opacity={s.opacity} />
    </svg>
  );
}

export function Legend({ mode, defaultOpen, preview = false }: { mode: ViewMode; defaultOpen: boolean; preview?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-t border-seam text-[11px] text-mist">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-controls="graph-legend" className="flex min-h-9 w-full items-center gap-2 px-3 py-1.5 text-left hover:text-bone">
        <span aria-hidden="true">{open ? "▾" : "▸"}</span> Legend
      </button>
      {open && (
        <ul id="graph-legend" className="flex flex-wrap gap-x-4 gap-y-1.5 px-3 pb-2.5" aria-label="Graph legend">
          {preview && (
            <li className="flex items-center gap-1.5">
              <Sample v="restored" />
              <span aria-hidden="true" className="text-spectral">
                ✓
              </span>
              Reconnected in preview (not applied)
            </li>
          )}
          {ITEMS.filter((i) => i.modes.includes(preview ? "after" : mode)).map((i) => (
            <li key={i.v} className="flex items-center gap-1.5">
              <Sample v={i.v} />
              <span aria-hidden="true" style={{ color: edgeSpec(i.v, "depends_on").stroke }}>
                {i.glyph}
              </span>
              {i.label}
            </li>
          ))}
          <li className="flex items-center gap-1.5">
            <span className="rounded-full border border-violet/40 px-1.5 font-mono text-[10px] text-violet">≋ net</span> network tag
            <span className="rounded-full border border-spectral/50 px-1.5 font-mono text-[10px] text-spectral">+ net</span> joined
            <span className="rounded-full border border-dashed border-veil/60 px-1.5 font-mono text-[10px] text-veil line-through">− net</span> left
          </li>
          <li className="flex items-center gap-1.5">
            <span aria-hidden="true">☽</span> Ghost: removed or undefined service
          </li>
          <li className="flex items-center gap-1.5">
            <span aria-hidden="true">✦</span> Added service
          </li>
          <li className="flex items-center gap-1.5">
            <span aria-hidden="true" className="text-bile">
              ≈ ?
            </span>
            Fog: not analyzed, uncertain
          </li>
        </ul>
      )}
    </div>
  );
}
