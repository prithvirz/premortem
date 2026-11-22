"use client";

import { ReactFlowProvider } from "@xyflow/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { analyze } from "@/lib/compose/analyze";
import type { RequiredEnvPolicy } from "@/lib/compose/types";
import { SCENARIOS } from "@/lib/examples/scenarios";
import { buildGraphModel, type GraphModel, type ViewMode } from "@/lib/viz/graph";
import { previewFix, type FixPreview } from "@/lib/fix/preview";
import { proposeFix } from "@/lib/fix/proposals";
import { buildHeadline } from "@/lib/viz/headline";
import { previewGraph } from "@/lib/viz/preview-view";
import { highlightFor, type Highlight, type Selection } from "@/lib/viz/highlight";
import { summarize } from "@/lib/viz/summary";
import { buildTimeline, type TimelineStep } from "@/lib/viz/timeline";
import { viewGraph } from "@/lib/viz/view";
import { ComposeEditors } from "./ComposeEditors";
import { GraphCanvas, type FocusRequest } from "./GraphCanvas";
import { Inspector } from "./Inspector";
import { Legend } from "./Legend";
import { NetworkStrip } from "./NetworkStrip";
import { RiskList } from "./RiskList";
import { Timeline } from "./Timeline";
import { Panel } from "./ui";
import { useMediaQuery } from "./useMediaQuery";
import { Verdict } from "./Verdict";

const SCENARIO_KIND: Record<string, { kind: string; glyph: string }> = {
  "severed-cache": { kind: "Network isolation", glyph: "≋" },
  "renamed-database": { kind: "Missing dependency", glyph: "☽" },
  "quiet-config-drift": { kind: "Ports & required config", glyph: "⇄" },
};

const policyToYaml = (p?: RequiredEnvPolicy): string =>
  p ? `requiredEnv:\n${Object.entries(p.requiredEnv).map(([k, v]) => `  ${k === "*" ? '"*"' : k}: [${v.join(", ")}]`).join("\n")}\n` : "";

const MODES: { id: ViewMode; label: string; hint: string }[] = [
  { id: "before", label: "Before", hint: "The BEFORE configuration only" },
  { id: "diff", label: "Changes", hint: "Both versions overlaid: added, removed, and affected parts marked" },
  { id: "after", label: "After", hint: "The AFTER configuration with possible impacts" },
];

/** Canvas height that follows the graph's aspect ratio, so wide graphs do not leave empty bands. */
function canvasHeightFor(model: GraphModel): number {
  const svcs = model.nodes.filter((n) => n.kind === "service");
  if (svcs.length === 0) return 440;
  const w = Math.max(...svcs.map((n) => n.position.x)) + 220 - Math.min(...svcs.map((n) => n.position.x));
  const h = Math.max(...svcs.map((n) => n.position.y)) + 150 - Math.min(...svcs.map((n) => n.position.y));
  // Assume roughly 1000px of canvas width on desktop; add room for padding and controls.
  return Math.round(Math.min(720, Math.max(440, (h / w) * 1000 + 140)));
}

export function Observatory() {
  const first = SCENARIOS[0]!;
  const [scenarioId, setScenarioId] = useState<string | null>(first.id);
  const [input, setInput] = useState({ before: first.before, after: first.after, policyText: policyToYaml(first.policy) });
  const [mode, setMode] = useState<ViewMode>("diff");
  const [selection, setSelection] = useState<Selection>(null);
  const [stepIndex, setStepIndex] = useState<number | null>(null);
  const [focus, setFocus] = useState<FocusRequest | null>(null);
  const [editorsOpen, setEditorsOpen] = useState(false);
  const [mobileView, setMobileView] = useState<"list" | "graph">("list");
  const [navAtEnd, setNavAtEnd] = useState(false);
  const [preview, setPreview] = useState<FixPreview | null>(null);
  const [previewSide, setPreviewSide] = useState<"proposed" | "current">("proposed");
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [undo, setUndo] = useState<{ after: string; scenarioId: string | null; label: string } | null>(null);
  const isMobile = useMediaQuery("(max-width: 639px)");
  const inspectorRef = useRef<HTMLElement>(null);

  const report = useMemo(() => analyze(input), [input]);
  const derived = useMemo(() => {
    if (!report.ok) return null;
    const model = buildGraphModel(report.models.before, report.models.after, report.diff, report.findings);
    const fileUnknowns = [...new Set([...report.diagnostics.before, ...report.diagnostics.after].filter((d) => !d.service && d.level === "warning").map((d) => d.message))];
    return {
      model,
      steps: buildTimeline(model, report.diff, report.findings),
      summary: summarize(report),
      headline: buildHeadline(report.findings),
      fileUnknowns,
      layoutKey: model.nodes.map((n) => n.id).join("|"),
      canvasHeight: canvasHeightFor(model),
    };
  }, [report]);

  const proposed = useMemo(() => {
    if (!preview || !derived) return null;
    const r = preview.report;
    const [kind, from, to] = preview.option.id.split(":");
    const takeover = kind === "retarget" && from && to ? { from: `svc:${from}`, to: `svc:${to}` } : undefined;
    return previewGraph(derived.model, buildGraphModel(r.models.before, r.models.after, r.diff, r.findings), takeover);
  }, [preview, derived]);
  const baseView = useMemo(() => (derived ? viewGraph(derived.model, mode) : null), [derived, mode]);
  const currentAfterView = useMemo(() => (derived && preview ? viewGraph(derived.model, "after") : null), [derived, preview]);
  const view = proposed ? (previewSide === "proposed" ? proposed.view : currentAfterView) : baseView;
  const step: TimelineStep | null = derived && stepIndex !== null ? (derived.steps[stepIndex] ?? null) : null;
  const baseHighlight = useMemo(
    () => (derived && report.ok ? highlightFor(derived.model, report.findings, selection, step) : null),
    [derived, report, selection, step],
  );
  const previewHighlight = useMemo((): Highlight | null => {
    if (!proposed) return null;
    const ids = new Set<string>();
    for (const e of proposed.view.edges) if (proposed.restoredEdgeIds.includes(e.id)) [e.id, e.source, e.target].forEach((x) => ids.add(x));
    const networks = new Map<string, "related">();
    for (const n of proposed.view.nodes) for (const t of n.networks) if (t.state === "proposed") networks.set(t.id, "related");
    return ids.size ? { ids, networks } : null;
  }, [proposed]);
  const highlight = proposed && previewSide === "proposed" ? previewHighlight : baseHighlight;

  // Frame what the preview reconnects (endpoints of restored relationships), not the removed ghost.
  useEffect(() => {
    if (!proposed) return;
    const ids = [...(previewHighlight?.ids ?? [])].filter((id) => id.startsWith("svc:"));
    if (ids.length) setFocus({ ids, nonce: Date.now() });
  }, [proposed, previewHighlight]);

  const selectedFinding = report.ok && selection?.kind === "finding" ? report.findings.find((f) => f.id === selection.id) : undefined;
  const fixOffer = useMemo(
    () => (report.ok && selectedFinding ? proposeFix(selectedFinding, report.models.before, report.models.after, input.after) : null),
    [report, selectedFinding, input.after],
  );
  const selectedId = selection && selection.kind !== "finding" ? selection.id : null;

  const focusOn = useCallback((ids: string[]) => setFocus({ ids, nonce: Date.now() }), []);
  const revealInspector = useCallback(() => {
    if (window.matchMedia("(max-width: 1023px)").matches) inspectorRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, []);

  const select = useCallback((s: Selection) => {
    setSelection(s);
    setStepIndex(null);
  }, []);
  const onSelectNode = useCallback(
    (id: string) => {
      select({ kind: "node", id });
      revealInspector();
    },
    [select, revealInspector],
  );
  const onSelectEdge = useCallback(
    (id: string) => {
      select({ kind: "edge", id });
      revealInspector();
    },
    [select, revealInspector],
  );
  const onClear = useCallback(() => {
    setSelection(null);
    setStepIndex(null);
  }, []);

  const loadScenario = (id: string) => {
    const s = SCENARIOS.find((x) => x.id === id);
    if (!s) return;
    setScenarioId(id);
    setInput({ before: s.before, after: s.after, policyText: policyToYaml(s.policy) });
    setSelection(null);
    setStepIndex(null);
    setMode("diff");
    setFocus(null);
    setPreview(null);
    setPreviewError(null);
    setUndo(null);
  };

  const startPreview = (optionId: string) => {
    if (!report.ok || !fixOffer?.eligible) return;
    const option = fixOffer.options.find((o) => o.id === optionId);
    if (!option) return;
    const p = previewFix(input, report, fixOffer.findingId, option);
    if ("error" in p) {
      setPreviewError(p.error);
      return;
    }
    setPreviewError(null);
    setPreview(p);
    setPreviewSide("proposed");
    setStepIndex(null);
  };
  const discardPreview = () => {
    setPreview(null);
    setPreviewError(null);
  };
  const applyPreview = () => {
    if (!preview) return;
    setUndo({ after: input.after, scenarioId, label: preview.option.label });
    setInput((prev) => ({ ...prev, after: preview.proposedAfter }));
    setScenarioId(null);
    setPreview(null);
    setSelection(null);
    setStepIndex(null);
  };
  const undoApply = () => {
    if (!undo) return;
    setInput((prev) => ({ ...prev, after: undo.after }));
    setScenarioId(undo.scenarioId);
    setUndo(null);
    setSelection(null);
  };

  const activateStep = (i: number | null) => {
    setStepIndex(i);
    if (i === null || !derived) {
      setSelection(null);
      return;
    }
    const s = derived.steps[i];
    if (!s) return;
    setMode(s.suggestedMode);
    setSelection(s.findingId ? { kind: "finding", id: s.findingId } : s.nodeIds.length === 1 ? { kind: "node", id: s.nodeIds[0]! } : null);
    const svcIds = s.nodeIds.filter((x) => x.startsWith("svc:"));
    if (svcIds.length) focusOn(svcIds);
  };

  const openHeadline = () => {
    if (!derived?.headline) return;
    const f = derived.headline.finding;
    select({ kind: "finding", id: f.id });
    const ids = derived.steps.find((s) => s.findingId === f.id)?.nodeIds ?? [];
    if (ids.length) focusOn(ids);
    revealInspector();
  };

  const scenario = SCENARIOS.find((s) => s.id === scenarioId);
  const showGraph = !isMobile || mobileView === "graph";

  return (
    <div className="mx-auto max-w-[1600px] space-y-3 px-3 py-3 sm:px-5 sm:py-4">
      <header className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <div className="leading-tight">
          <h1 className="font-display text-2xl tracking-tight">
            Pre<span className="text-violet">Mortem</span>
          </h1>
          <p className="hidden text-[11px] text-mist md:block">See what your deployment might break before it goes live.</p>
        </div>
        <div className="relative max-w-full min-w-0">
        <nav
          aria-label="Example scenarios"
          className="pm-scroll -mx-1 flex max-w-full snap-x gap-1.5 overflow-x-auto px-1 pb-1"
          onScroll={(e) => {
            const el = e.currentTarget;
            setNavAtEnd(el.scrollLeft + el.clientWidth >= el.scrollWidth - 4);
          }}
        >
          {SCENARIOS.map((s) => {
            const k = SCENARIO_KIND[s.id]!;
            const active = s.id === scenarioId;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => loadScenario(s.id)}
                aria-pressed={active}
                title={s.story}
                className={`min-h-11 shrink-0 snap-start rounded-lg border px-3 py-1 text-left transition-colors ${active ? "border-violet/60 bg-violet/[0.1]" : "border-seam bg-crypt/70 hover:border-violet/30"}`}
              >
                <span className="block text-[10px] font-semibold tracking-[0.1em] text-veil uppercase">
                  <span aria-hidden="true" className="text-violet">
                    {k.glyph}{" "}
                  </span>
                  {k.kind}
                </span>
                <span className="block font-display text-[15px] leading-tight text-bone">{s.name}</span>
              </button>
            );
          })}
        </nav>
          {/* Scroll affordance: shown only while more scenarios are off-screen. */}
          <div aria-hidden="true" className={`pointer-events-none absolute top-0 right-0 bottom-1 flex w-12 items-center justify-end bg-gradient-to-l from-void via-void/80 to-transparent pr-0.5 text-veil transition-opacity sm:hidden ${navAtEnd ? "opacity-0" : "opacity-100"}`}>
            ›
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span className="hidden rounded-full border border-spectral/30 bg-spectral/[0.06] px-2.5 py-1 text-xs whitespace-nowrap text-spectral md:inline" title="Nothing leaves this browser tab">
            ● Local only · nothing uploaded
          </span>
          <button
            type="button"
            onClick={() => setEditorsOpen((v) => !v)}
            aria-expanded={editorsOpen || !report.ok}
            aria-controls="compose-editors"
            className="min-h-10 rounded-lg border border-violet/50 bg-violet/10 px-3 py-1.5 text-sm text-violet hover:bg-violet/20"
          >
            {editorsOpen || !report.ok ? "Hide" : "Edit"} Compose files
          </button>
        </div>
      </header>
      <p className="line-clamp-2 text-xs text-mist sm:line-clamp-1">
        {scenario ? (
          <>
            <span className="text-veil">{scenario.name}: </span>
            {scenario.story}
          </>
        ) : (
          "Custom input: analyzing your edited files locally."
        )}
      </p>

      {(editorsOpen || !report.ok) && (
        <Panel id="compose-editors" aria-label="Compose editors">
          <ComposeEditors
            {...input}
            diagnostics={report.diagnostics}
            onChange={(field, value) => {
              setInput((prev) => ({ ...prev, [field]: value }));
              setScenarioId(null);
              setStepIndex(null);
              setPreview(null);
              setUndo(null);
            }}
          />
        </Panel>
      )}

      {!report.ok || !derived || !view ? (
        <Panel className="p-6">
          <h2 className="font-display text-xl text-blood">The files could not be read</h2>
          <p className="mt-1 text-sm text-mist">PreMortem only analyzes valid Compose YAML. Fix the errors shown under the editors; nothing was guessed.</p>
          <ul className="mt-3 space-y-1 text-sm">
            {(["before", "after"] as const).flatMap((side) =>
              report.diagnostics[side]
                .filter((d) => d.level === "error")
                .map((d, i) => (
                  <li key={`${side}${i}`}>
                    <span className="font-mono text-xs text-veil uppercase">{side}</span> {d.message}
                    {d.line ? ` (line ${d.line})` : ""}
                  </li>
                )),
            )}
          </ul>
        </Panel>
      ) : (
        <>
          {undo && (
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-violet/40 bg-violet/[0.07] px-4 py-2 text-sm" role="status">
              <span className="text-violet">Applied to the AFTER editor:</span>
              <span className="text-bone">{undo.label}.</span>
              <span className="text-mist">The analysis below is of the edited AFTER. Nothing was saved or uploaded.</span>
              <button type="button" onClick={undoApply} className="ml-auto min-h-9 rounded-md border border-violet/50 px-3 text-sm text-violet hover:bg-violet/15">
                Undo
              </button>
            </div>
          )}
          <Panel>
            <Verdict
              summary={derived.summary}
              headline={derived.headline}
              onOpenHeadline={openHeadline}
              onShowUnknowns={() => {
                onClear();
                inspectorRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
              }}
            />
          </Panel>

          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_380px]">
            <div className="min-w-0 space-y-3">
              <Panel className="overflow-hidden">
                <div className="flex flex-wrap items-center gap-2 border-b border-seam px-3 py-2">
                  {isMobile && (
                    <div role="radiogroup" aria-label="Mobile layout" className="flex rounded-lg border border-seam bg-void p-0.5">
                      {(["list", "graph"] as const).map((v) => (
                        <button
                          key={v}
                          type="button"
                          role="radio"
                          aria-checked={mobileView === v}
                          onClick={() => setMobileView(v)}
                          className={`min-h-9 rounded-md px-3 text-sm ${mobileView === v ? "bg-slab text-bone shadow-[inset_0_0_0_1px_var(--color-violet)]" : "text-mist"}`}
                        >
                          {v === "list" ? "Risk list" : "Graph"}
                        </button>
                      ))}
                    </div>
                  )}
                  {preview ? (
                    <div className="flex flex-wrap items-center gap-2" data-testid="preview-toolbar">
                      <span className="rounded-md border border-spectral/50 bg-spectral/10 px-2 py-1 text-[11px] font-semibold tracking-[0.12em] text-spectral uppercase">What-if preview · not applied</span>
                      <div role="radiogroup" aria-label="Preview comparison" className="flex rounded-lg border border-seam bg-void p-0.5">
                        {(["current", "proposed"] as const).map((side) => (
                          <button
                            key={side}
                            type="button"
                            role="radio"
                            aria-checked={previewSide === side}
                            onClick={() => setPreviewSide(side)}
                            className={`min-h-9 rounded-md px-3 text-sm ${previewSide === side ? (side === "proposed" ? "bg-spectral/15 text-spectral shadow-[inset_0_0_0_1px_var(--color-spectral)]" : "bg-slab text-bone shadow-[inset_0_0_0_1px_var(--color-violet)]") : "text-mist hover:text-bone"}`}
                          >
                            {side === "current" ? "Current AFTER" : "Proposed AFTER"}
                          </button>
                        ))}
                      </div>
                      <span className={`text-xs ${preview.targetCleared ? "text-spectral" : "text-ember"}`}>{preview.verdict}</span>
                      <button type="button" onClick={discardPreview} className="ml-auto min-h-9 rounded-md border border-seam px-3 text-sm text-bone hover:bg-slab">
                        Discard preview
                      </button>
                    </div>
                  ) : (
                    <>
                  <div role="radiogroup" aria-label="Comparison view" className="flex rounded-lg border border-seam bg-void p-0.5">
                    {MODES.map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        role="radio"
                        aria-checked={mode === m.id}
                        title={m.hint}
                        onClick={() => setMode(m.id)}
                        onKeyDown={(e) => {
                          if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
                          e.preventDefault();
                          const i = MODES.findIndex((x) => x.id === mode);
                          const next = MODES[(i + (e.key === "ArrowRight" ? 1 : MODES.length - 1)) % MODES.length]!;
                          setMode(next.id);
                          (e.currentTarget.parentElement?.querySelectorAll("button")[MODES.indexOf(next)] as HTMLButtonElement | undefined)?.focus();
                        }}
                        tabIndex={mode === m.id ? 0 : -1}
                        className={`min-h-9 rounded-md px-3 text-sm transition-colors ${mode === m.id ? "bg-slab text-bone shadow-[inset_0_0_0_1px_var(--color-violet)]" : "text-mist hover:text-bone"}`}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                  <p className="hidden text-xs text-veil md:block">{MODES.find((m) => m.id === mode)!.hint}.</p>
                    </>
                  )}                </div>
                <NetworkStrip graph={view} highlight={highlight} selectedId={selectedId} onSelect={onSelectNode} />
                {showGraph ? (
                  <div className={`relative ${isMobile ? "h-[58vh] min-h-[380px]" : ""} ${preview && previewSide === "proposed" ? "pm-preview-frame" : ""}`} style={isMobile ? undefined : { height: derived.canvasHeight }} role="region" aria-label="Service dependency graph">
                    {/* Remount per analyzed model: React Flow fits the view after measuring the new nodes. */}
                    <ReactFlowProvider key={`${derived.layoutKey}|${isMobile ? "m" : "d"}`}>
                      <GraphCanvas
                        graph={view}
                        mode={mode}
                        highlight={highlight}
                        selectedId={selectedId}
                        focus={focus}
                        fileUnknowns={derived.fileUnknowns}
                        compact={isMobile}
                        initialFocusIds={derived.headline ? derived.steps.find((s) => s.findingId === derived.headline!.finding.id)?.nodeIds : undefined}
                        onSelectNode={onSelectNode}
                        onSelectEdge={onSelectEdge}
                        onClear={onClear}
                        onShowUnknowns={() => {
                          onClear();
                          inspectorRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
                        }}
                      />
                    </ReactFlowProvider>
                  </div>
                ) : (
                  <RiskList graph={view} findings={report.findings} highlight={highlight} selectedId={selectedId} onSelectNode={onSelectNode} onSelectEdge={onSelectEdge} />
                )}
                <Legend key={isMobile ? "m" : "d"} mode={mode} defaultOpen={!isMobile} preview={Boolean(preview && previewSide === "proposed")} />
              </Panel>

              <Panel>
                <Timeline
                  steps={derived.steps}
                  active={stepIndex}
                  onActivate={activateStep}
                  onGoTo={(s) => {
                    const svc = s.nodeIds.filter((x) => x.startsWith("svc:"));
                    focusOn(svc);
                    if (s.nodeIds.length === 1) setSelection({ kind: "node", id: s.nodeIds[0]! });
                  }}
                  onInspect={(s) => {
                    setSelection({ kind: "finding", id: s.findingId ?? s.relatedFindingIds[0]! });
                    revealInspector();
                  }}
                />
              </Panel>
            </div>

            <aside ref={inspectorRef} aria-label="Evidence inspector" className="min-w-0 scroll-mt-3 lg:sticky lg:top-3 lg:self-start">
              <Panel className="pm-scroll p-4 lg:max-h-[calc(100vh-1.5rem)] lg:overflow-y-auto">
                <div className="mb-3 text-[11px] font-semibold tracking-[0.22em] text-violet uppercase">Evidence inspector</div>
                {previewError && <p className="mb-3 rounded-lg border border-ember/40 bg-ember/[0.06] p-2 text-sm text-ember">{previewError}</p>}
                <Inspector
                  report={report}
                  model={derived.model}
                  summary={derived.summary}
                  mode={mode}
                  selection={selection}
                  onSelect={select}
                  onFocus={focusOn}
                  fix={fixOffer ? { offer: fixOffer, preview, onPreview: startPreview, onDiscard: discardPreview, onApply: applyPreview } : undefined}
                />
              </Panel>
            </aside>
          </div>
        </>
      )}

      <footer className="pt-1 pb-5 text-xs text-veil">
        Static analysis of two Compose files. PreMortem separates confirmed configuration changes from possible consequences; it does not predict runtime failures with certainty.
      </footer>
    </div>
  );
}
