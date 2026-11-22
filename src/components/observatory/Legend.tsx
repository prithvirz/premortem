import type { ViewMode } from "@/lib/viz/graph";
import type { EdgeVisual } from "@/lib/viz/view";
import { edgeSpec } from "@/lib/viz/visuals";

const ITEMS: { v: EdgeVisual; label: string; glyph: string; modes: ViewMode[] }[] = [
  { v: "steady", label: "Declared dependency", glyph: "→", modes: ["before", "diff", "after"] },
  { v: "broken", label: "Broken in configuration", glyph: "✕", modes: ["diff", "after"] },
  { v: "at-risk", label: "Possibly affected", glyph: "!", modes: ["diff", "after"] },
  { v: "isolated", label: "Isolated, no declared link", glyph: "∅", modes: ["diff", "after"] },
  { v: "added", label: "Added", glyph: "+", modes: ["diff", "after"] },
  { v: "removed", label: "Removed", glyph: "−", modes: ["before", "diff"] },
];

export function Legend({ mode }: { mode: ViewMode }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1.5 border-t border-seam px-3 py-2 text-[11px] text-mist" aria-label="Graph legend">
      {ITEMS.filter((i) => i.modes.includes(mode)).map((i) => {
        const s = edgeSpec(i.v, "depends_on");
        return (
          <li key={i.v} className="flex items-center gap-1.5">
            <svg width="28" height="8" aria-hidden="true">
              <line x1="0" y1="4" x2="28" y2="4" stroke={s.stroke} strokeWidth={s.width} strokeDasharray={s.dash} opacity={s.opacity} />
            </svg>
            <span aria-hidden="true" style={{ color: s.stroke }}>
              {i.glyph}
            </span>
            {i.label}
          </li>
        );
      })}
      <li className="flex items-center gap-1.5">
        <svg width="28" height="8" aria-hidden="true">
          <line x1="0" y1="4" x2="28" y2="4" stroke="#9b8cff" strokeWidth="1" strokeDasharray="2 5" opacity="0.6" />
        </svg>
        Network membership
      </li>
      <li className="flex items-center gap-1.5">
        <span aria-hidden="true">☽</span> Removed or undefined service
      </li>
      <li className="flex items-center gap-1.5">
        <span aria-hidden="true" className="text-bile">
          ?
        </span>{" "}
        Not analyzed
      </li>
    </ul>
  );
}
