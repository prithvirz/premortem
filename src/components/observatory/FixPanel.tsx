"use client";

import { useEffect, useState } from "react";
import type { FixPreview } from "@/lib/fix/preview";
import type { FixOffer } from "@/lib/fix/proposals";
import { SectionLabel, SeverityBadge } from "./ui";

interface Props {
  offer: FixOffer;
  preview: FixPreview | null;
  onPreview: (optionId: string) => void;
  onDiscard: () => void;
  onApply: () => void;
}

const NOT_PROOF = "A static configuration check. It does not show that the deployment works.";

export function FixPanel({ offer, preview, onPreview, onDiscard, onApply }: Props) {
  const [optionId, setOptionId] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [applyStep, setApplyStep] = useState(false);

  // Reset local choices when the finding changes.
  useEffect(() => {
    setOptionId(null);
    setConfirmed(false);
    setApplyStep(false);
  }, [offer.findingId]);

  if (!offer.eligible) {
    return (
      <div className="rounded-lg border border-seam bg-void/50 p-3" data-testid="fix-ineligible">
        <SectionLabel>Possible fix</SectionLabel>
        <p className="text-sm text-mist">No automatic correction is offered. {offer.reason}</p>
      </div>
    );
  }

  const active = preview && preview.targetFindingId === offer.findingId ? preview : null;
  const chosen = offer.options.find((o) => o.id === (active?.option.id ?? optionId)) ?? offer.options.find((o) => o.recommended) ?? offer.options[0]!;
  const needsConfirm = Boolean(chosen.confirmation);
  const canPreview = !needsConfirm || confirmed;

  return (
    <section className="pm-fix rounded-xl border border-spectral/35 bg-spectral/[0.035] p-3" aria-labelledby="fix-title" data-testid="fix-panel">
      <div className="mb-1 text-[11px] font-semibold tracking-[0.14em] text-spectral uppercase">◇ Possible fix · what-if preview</div>
      <h3 id="fix-title" className="font-display text-[17px] leading-snug text-bone">
        {offer.title}
      </h3>
      <p className="mt-1 text-sm leading-relaxed text-mist">{offer.explanation}</p>

      {!active && offer.options.length > 1 && (
        <fieldset className="mt-3 space-y-1.5">
          <legend className="mb-1 text-[11px] font-semibold tracking-[0.14em] text-veil uppercase">Choose a correction</legend>
          {offer.options.map((o) => (
            <label key={o.id} className={`flex min-h-10 cursor-pointer items-start gap-2 rounded-lg border px-2.5 py-2 text-sm ${chosen.id === o.id ? "border-spectral/60 bg-spectral/[0.06]" : "border-seam"}`}>
              <input
                type="radio"
                name={`fix-${offer.findingId}`}
                className="mt-1 accent-[var(--color-spectral)]"
                checked={chosen.id === o.id}
                onChange={() => {
                  setOptionId(o.id);
                  setConfirmed(false);
                }}
              />
              <span>
                {o.label}
                {o.recommended && <span className="ml-1.5 text-[11px] text-spectral">suggested</span>}
              </span>
            </label>
          ))}
        </fieldset>
      )}

      <div className="mt-3">
        <SectionLabel>What would change in AFTER</SectionLabel>
        <ul className="space-y-1.5">
          {chosen.changes.map((c) => (
            <li key={c.path} className="rounded-lg border border-seam bg-void/70 p-2 font-mono text-[11.5px]">
              <div className="text-veil">{c.path}</div>
              <div className="mt-0.5 text-mist line-through decoration-veil/60">{c.before}</div>
              <div className="text-spectral">{c.after}</div>
            </li>
          ))}
        </ul>
      </div>

      {chosen.warnings.length > 0 && (
        <ul className="mt-3 space-y-1 rounded-lg border border-ember/40 bg-ember/[0.06] p-2.5 text-sm text-ember" role="note">
          {chosen.warnings.map((w) => (
            <li key={w}>
              <span aria-hidden="true">! </span>
              {w}
            </li>
          ))}
        </ul>
      )}
      <ul className="mt-3 space-y-1 rounded-lg border border-bile/30 bg-bile/[0.04] p-2.5 text-[13px] text-mist" aria-label="Before you use this">
        {chosen.disclosures.map((d) => (
          <li key={d}>
            <span aria-hidden="true" className="text-bile">
              ?{" "}
            </span>
            {d}
          </li>
        ))}
      </ul>

      {!active ? (
        <div className="mt-3 space-y-2">
          {needsConfirm && (
            <label className="flex min-h-10 cursor-pointer items-start gap-2 text-sm">
              <input type="checkbox" className="mt-1 accent-[var(--color-spectral)]" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} data-testid="fix-confirm" />
              <span>{chosen.confirmation}</span>
            </label>
          )}
          <button
            type="button"
            onClick={() => onPreview(chosen.id)}
            disabled={!canPreview}
            className="min-h-10 w-full rounded-lg border border-spectral/60 bg-spectral/15 px-3 py-2 text-sm font-medium text-spectral hover:bg-spectral/25 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Preview possible fix
          </button>
          <p className="text-xs text-veil">Nothing is applied. The preview reanalyzes a proposed copy of AFTER in this tab.</p>
        </div>
      ) : (
        <div className="mt-3 space-y-3" data-testid="fix-preview">
          <div className={`rounded-lg border p-2.5 ${active.targetCleared ? "border-spectral/50 bg-spectral/[0.07]" : "border-ember/50 bg-ember/[0.06]"}`} role="status" aria-live="polite">
            <div className="text-[11px] font-semibold tracking-[0.14em] text-veil uppercase">Reanalysis of the proposed AFTER</div>
            <p className={`mt-0.5 text-sm font-medium ${active.targetCleared ? "text-spectral" : "text-ember"}`} data-testid="fix-verdict">
              <span aria-hidden="true">{active.targetCleared ? "✓ " : "! "}</span>
              {active.verdict}
            </p>
            <p className="mt-1 text-xs text-mist">{NOT_PROOF}</p>
          </div>

          <FindingDelta title="Cleared" tone="text-spectral" glyph="✓" items={active.cleared} empty="Nothing cleared." />
          <FindingDelta title="New in the proposed AFTER" tone="text-ember" glyph="+" items={active.introduced} empty="No new findings." />
          <FindingDelta title="Still reported" tone="text-mist" glyph="·" items={active.remaining} empty="No other findings." />

          <div>
            <SectionLabel>AFTER → PROPOSED (changed lines)</SectionLabel>
            <pre className="pm-scroll max-h-56 overflow-auto rounded-lg border border-seam bg-void/80 p-2 font-mono text-[11.5px] leading-relaxed" data-testid="fix-diff">
              {active.diff.map((l, i) => (
                <div key={i} className={l.kind === "add" ? "bg-spectral/10 text-spectral" : l.kind === "del" ? "bg-blood/10 text-blood/90 line-through decoration-blood/40" : l.kind === "gap" ? "text-veil" : "text-mist"}>
                  <span aria-hidden="true" className="mr-2 inline-block w-3 text-veil select-none">
                    {l.kind === "add" ? "+" : l.kind === "del" ? "−" : " "}
                  </span>
                  <span className="sr-only">{l.kind === "add" ? "added: " : l.kind === "del" ? "removed: " : ""}</span>
                  {l.text || " "}
                </div>
              ))}
            </pre>
          </div>

          {!applyStep ? (
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={onDiscard} className="min-h-10 flex-1 rounded-lg border border-seam px-3 py-2 text-sm text-bone hover:bg-slab">
                Discard preview
              </button>
              <button type="button" onClick={() => setApplyStep(true)} className="min-h-10 flex-1 rounded-lg border border-violet/60 bg-violet/15 px-3 py-2 text-sm text-violet hover:bg-violet/25">
                Apply to AFTER editor…
              </button>
            </div>
          ) : (
            <div className="space-y-2 rounded-lg border border-violet/50 bg-violet/[0.07] p-2.5" role="alertdialog" aria-labelledby="apply-q" aria-describedby="apply-d">
              <p id="apply-q" className="text-sm font-medium text-bone">
                Replace the AFTER editor content with the proposed file?
              </p>
              <p id="apply-d" className="text-xs text-mist">
                Only the lines shown above change. BEFORE is not touched, nothing is saved or uploaded, and you can undo this once.
              </p>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => setApplyStep(false)} className="min-h-10 flex-1 rounded-lg border border-seam px-3 py-2 text-sm hover:bg-slab">
                  Cancel
                </button>
                <button type="button" onClick={onApply} className="min-h-10 flex-1 rounded-lg border border-violet/70 bg-violet/25 px-3 py-2 text-sm font-medium text-bone hover:bg-violet/35" autoFocus>
                  Confirm: apply to AFTER editor
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function FindingDelta({ title, tone, glyph, items, empty }: { title: string; tone: string; glyph: string; items: FixPreview["cleared"]; empty: string }) {
  return (
    <div>
      <SectionLabel>
        {title} ({items.length})
      </SectionLabel>
      {items.length === 0 ? (
        <p className="text-xs text-veil">{empty}</p>
      ) : (
        <ul className="space-y-1">
          {items.map((f) => (
            <li key={f.id} className={`flex items-start gap-2 text-[13px] ${tone}`}>
              <span aria-hidden="true">{glyph}</span>
              <SeverityBadge severity={f.severity} compact />
              <span className={title === "Cleared" ? "line-through decoration-spectral/50" : ""}>{f.title}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
