"use client";

import type { Diagnostic } from "@/lib/compose/types";

interface Props {
  before: string;
  after: string;
  policyText: string;
  diagnostics: { before: Diagnostic[]; after: Diagnostic[]; policy: Diagnostic[] };
  onChange: (field: "before" | "after" | "policyText", value: string) => void;
}

function DiagList({ items }: { items: Diagnostic[] }) {
  if (items.length === 0) return null;
  return (
    <ul className="mt-1.5 space-y-1" aria-live="polite">
      {items.map((d, i) => (
        <li key={i} className={`rounded border px-2 py-1 text-xs ${d.level === "error" ? "border-blood/40 bg-blood/[0.07] text-blood" : "border-bile/30 bg-bile/[0.05] text-bile"}`}>
          <span aria-hidden="true">{d.level === "error" ? "✕ " : "? "}</span>
          <span className="sr-only">{d.level}: </span>
          {d.message}
          {d.line ? ` (line ${d.line})` : ""}
        </li>
      ))}
    </ul>
  );
}

const area =
  "pm-scroll h-64 w-full resize-y rounded-lg border border-seam bg-void/80 p-3 font-mono text-[12px] leading-relaxed text-bone placeholder:text-veil focus:border-violet/60 focus:outline-none";

export function ComposeEditors({ before, after, policyText, diagnostics, onChange }: Props) {
  return (
    <div className="space-y-4 p-4">
      <div className="grid gap-4 lg:grid-cols-2">
        {(["before", "after"] as const).map((side) => (
          <div key={side} className="min-w-0">
            <label htmlFor={`editor-${side}`} className="mb-1.5 flex items-center gap-2 text-[11px] font-semibold tracking-[0.14em] text-veil uppercase">
              <span className={side === "before" ? "text-violet" : "text-spectral"}>{side === "before" ? "◐" : "●"}</span>
              {side} · docker-compose.yml
            </label>
            <textarea
              id={`editor-${side}`}
              data-testid={`editor-${side}`}
              className={area}
              value={side === "before" ? before : after}
              onChange={(e) => onChange(side, e.target.value)}
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
              aria-invalid={diagnostics[side].some((d) => d.level === "error")}
            />
            <DiagList items={diagnostics[side]} />
          </div>
        ))}
      </div>
      <div>
        <label htmlFor="editor-policy" className="mb-1.5 block text-[11px] font-semibold tracking-[0.14em] text-veil uppercase">
          Policy (optional): environment variables that must stay declared
        </label>
        <textarea
          id="editor-policy"
          data-testid="editor-policy"
          className={`${area} h-24`}
          value={policyText}
          onChange={(e) => onChange("policyText", e.target.value)}
          placeholder={"requiredEnv:\n  api: [DATABASE_URL]\n  \"*\": [LOG_LEVEL]"}
          spellCheck={false}
        />
        <DiagList items={diagnostics.policy} />
      </div>
      <p className="text-xs text-veil">Analysis runs in this browser tab. Nothing is uploaded, executed, or stored. Environment values are never read into the report.</p>
    </div>
  );
}
