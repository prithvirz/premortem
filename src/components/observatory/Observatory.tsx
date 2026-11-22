"use client";

import { ReactFlowProvider } from "@xyflow/react";
import { useCallback, useMemo, useRef, useState } from "react";
import { analyze } from "@/lib/compose/analyze";
import type { RequiredEnvPolicy } from "@/lib/compose/types";
import { SCENARIOS } from "@/lib/examples/scenarios";
import { buildGraphModel, type GraphModel, type ViewMode } from "@/lib/viz/graph";
import { summarize } from "@/lib/viz/summary";
import { buildTimeline, type TimelineStep } from "@/lib/viz/timeline";
import { viewGraph } from "@/lib/viz/view";
import { ComposeEditors } from "./ComposeEditors";
import { GraphCanvas, type FocusRequest } from "./GraphCanvas";
import { Inspector, type Selection } from "./Inspector";
import { Legend } from "./Legend";
import { SummaryStrip } from "./SummaryStrip";
import { Timeline } from "./Timeline";
import { Panel } from "./ui";

const SCENARIO_KIND: Record<string, { kind: string; glyph: string }> = {
  "severed-cache": { kind: "Network isolation", glyph: "≋" },
  "renamed-database": { kind: "Missing dependency", glyph: "☽" },
  "quiet-config-drift": { kind: "Ports & required config", glyph: "⇄" },
};

const policyToYaml = (p?: RequiredEnvPolicy): string =>
  p ? `requiredEnv:\n${Object.entries(p.requiredEnv).map(([k, v]) => `  ${k === "*" ? '"*"' : k}: [${v.join(", ")}]`).join("\n")}\n` : "";

const MODES: { id: ViewMode; label: string; hint: string }[] = [
  { id: "before", label: "Before", hint: "The BEFORE configuration only" },
  { id: "diff", label: "Changes", hint: "Both versions overlaid, with added, removed, and affected parts marked" },
  { id: "after", label: "After", hint: "The AFTER configuration with possible impacts" },
];

function highlightFor(model: GraphModel, selection: Selection, step: TimelineStep | null, findingNodes: (id: string) => string[]): Set<string> | null {
  const set = new Set<string>();
  if (step) {
    step.nodeIds.forEach((id) => set.add(id));
    step.edgeIds.forEach((id) => set.add(id));
  } else if (selection?.kind === "finding") {
    findingNodes(selection.id).forEach((id) => set.add(id));
    model.edges.filter((e) => e.findingIds.includes(selection.id)).forEach((e) => set.add(e.id));
  } else if (selection?.kind === "node") {
    set.add(selection.id);
    for (const e of model.edges) {
      if (e.source === selection.id || e.target === selection.id) {
        set.add(e.id);
        set.add(e.source);
        set.add(e.target);
      }
    }
  } else if (selection?.kind === "edge") {
    const e = model.edges.find((x) => x.id === selection.id);
    if (e) [e.id, e.source, e.target].forEach((id) => set.add(id));
  }
  return set.size ? set : null;
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
  const inspectorRef = useRef<HTMLElement>(null);

  const report = useMemo(() => analyze(input), [input]);
  const derived = useMemo(() => {
    if (!report.ok) return null;
    const model = buildGraphModel(report.models.before, report.models.after, report.diff, report.findings);
    return { model, steps: buildTimeline(model, report.diff, report.findings), summary: summarize(report) };
  }, [report]);

  const view = useMemo(() => (derived ? viewGraph(derived.model, mode) : null), [derived, mode]);
  const step = derived && stepIndex !== null ? (derived.steps[stepIndex] ?? null) : null;

  const findingNodes = useCallback((id: string) => derived?.steps.find((s) => s.findingId === id)?.nodeIds ?? [], [derived]);
  const highlight = useMemo(() => (derived ? highlightFor(derived.model, selection, step, findingNodes) : null), [derived, selection, step, findingNodes]);

  const focusOn = useCallback((ids: string[]) => setFocus({ ids, nonce: Date.now() }), []);
  const revealInspector = () => {
    if (window.matchMedia("(max-width: 1023px)").matches) inspectorRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  };

  const select = useCallback((s: Selection) => {
    setSelection(s);
    setStepIndex(null);
  }, []);
  const onSelectNode = useCallback((id: string) => select({ kind: "node", id }), [select]);
  const onSelectEdge = useCallback((id: string) => select({ kind: "edge", id }), [select]);
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
    if (s.nodeIds.length) focusOn(s.nodeIds);
  };

  const scenario = SCENARIOS.find((s) => s.id === scenarioId);

  return (
    <div className="mx-auto max-w-[1500px] space-y-4 px-3 py-5 sm:px-5 lg:py-7">
      <header className="flex flex-wrap items-end gap-x-6 gap-y-3">
        <div>
          <p className="text-[11px] font-semibold tracking-[0.22em] text-violet uppercase">Haunted Infrastructure Observatory</p>
          <h1 className="font-display text-3xl tracking-tight sm:text-4xl">
            Pre<span className="text-violet">Mortem</span>
          </h1>
          <p className="mt-1 max-w-xl text-sm text-mist">See what your deployment might break before it goes live.</p>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-spectral/30 bg-spectral/[0.06] px-2.5 py-1 text-xs text-spectral" title="Nothing leaves this browser tab">
            ● Local analysis · nothing uploaded
          </span>
          <button
            type="button"
            onClick={() => setEditorsOpen((v) => !v)}
            aria-expanded={editorsOpen || !report.ok}
            aria-controls="compose-editors"
            className="rounded-lg border border-violet/50 bg-violet/10 px-3 py-1.5 text-sm text-violet hover:bg-violet/20"
          >
            {editorsOpen || !report.ok ? "Hide" : "Edit"} Compose files
          </button>
        </div>
      </header>

      <nav aria-label="Example scenarios" className="grid gap-2 sm:grid-cols-3">
        {SCENARIOS.map((s) => {
          const k = SCENARIO_KIND[s.id]!;
          const active = s.id === scenarioId;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => loadScenario(s.id)}
              aria-pressed={active}
              className={`group rounded-xl border p-3 text-left transition-colors ${active ? "border-violet/60 bg-violet/[0.08]" : "border-seam bg-crypt/70 hover:border-violet/30"}`}
            >
              <div className="flex items-center gap-2 text-[11px] font-semibold tracking-[0.12em] text-veil uppercase">
                <span aria-hidden="true" className="text-violet">
                  {k.glyph}
                </span>
                {k.kind}
              </div>
              <div className="mt-0.5 font-display text-base text-bone">{s.name}</div>
              <p className={`mt-1 text-xs leading-relaxed text-mist ${active ? "" : "line-clamp-2"}`}>{s.story}</p>
            </button>
          );
        })}
      </nav>
      {!scenario && <p className="text-xs text-veil">Custom input: analyzing your edited files.</p>}

      {(editorsOpen || !report.ok) && (
        <Panel id="compose-editors" aria-label="Compose editors">
          <ComposeEditors
            {...input}
            diagnostics={report.diagnostics}
            onChange={(field, value) => {
              setInput((prev) => ({ ...prev, [field]: value }));
              setScenarioId(null);
              setStepIndex(null);
            }}
          />
        </Panel>
      )}

      {!report.ok || !derived || !view ? (
        <Panel className="p-6" role="alert">
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
          <Panel>
            <SummaryStrip
              summary={derived.summary}
              onShowUnknowns={() => {
                onClear();
                inspectorRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
              }}
            />
          </Panel>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_400px]">
            <div className="min-w-0 space-y-4">
              <Panel className="overflow-hidden">
                <div className="flex flex-wrap items-center gap-3 border-b border-seam px-3 py-2">
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
                        className={`rounded-md px-3 py-1 text-sm transition-colors ${mode === m.id ? "bg-slab text-bone shadow-[inset_0_0_0_1px_var(--color-violet)]" : "text-mist hover:text-bone"}`}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-veil">{MODES.find((m) => m.id === mode)!.hint}.</p>
                </div>
                <div className="relative h-[400px] sm:h-[540px]" aria-label="Service dependency graph" role="region">
                  <ReactFlowProvider>
                    <GraphCanvas
                      graph={view}
                      layoutKey={derived.model.nodes.map((n) => n.id).join("|")}
                      mode={mode}
                      highlight={highlight}
                      selectedId={selection && selection.kind !== "finding" ? selection.id : null}
                      focus={focus}
                      onSelectNode={(id) => {
                        onSelectNode(id);
                        revealInspector();
                      }}
                      onSelectEdge={(id) => {
                        onSelectEdge(id);
                        revealInspector();
                      }}
                      onClear={onClear}
                    />
                  </ReactFlowProvider>
                </div>
                <Legend mode={mode} />
              </Panel>

              <Panel>
                <Timeline
                  steps={derived.steps}
                  active={stepIndex}
                  onActivate={activateStep}
                  onGoTo={(s) => {
                    focusOn(s.nodeIds);
                    if (s.nodeIds.length === 1) setSelection({ kind: "node", id: s.nodeIds[0]! });
                  }}
                  onInspect={(s) => {
                    setSelection({ kind: "finding", id: s.findingId ?? s.relatedFindingIds[0]! });
                    revealInspector();
                  }}
                />
              </Panel>
            </div>

            <aside ref={inspectorRef} aria-label="Evidence inspector" className="min-w-0 scroll-mt-4 lg:sticky lg:top-4 lg:self-start">
              <Panel className="pm-scroll p-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto">
                <div className="mb-3 text-[11px] font-semibold tracking-[0.22em] text-violet uppercase">Evidence inspector</div>
                <Inspector report={report} model={derived.model} summary={derived.summary} mode={mode} selection={selection} onSelect={select} onFocus={focusOn} />
              </Panel>
            </aside>
          </div>
        </>
      )}

      <footer className="pt-2 pb-6 text-xs text-veil">
        Static analysis of two Compose files. PreMortem shows confirmed configuration changes and possible consequences; it does not predict runtime failures with certainty.
      </footer>
    </div>
  );
}
