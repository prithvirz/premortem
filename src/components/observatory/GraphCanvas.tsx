"use client";

import {
  Background,
  BackgroundVariant,
  Controls,
  EdgeLabelRenderer,
  Handle,
  Panel as FlowPanel,
  Position,
  ReactFlow,
  getBezierPath,
  useReactFlow,
  type Edge,
  type EdgeProps,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ViewMode } from "@/lib/viz/graph";
import type { Highlight, NetworkEmphasis } from "@/lib/viz/highlight";
import type { EdgeVisual, NetworkTag, ViewEdge, ViewGraph, ViewNode } from "@/lib/viz/view";
import { EDGE_KIND_LABEL, edgeSpec, nodeBadges, severityVisual } from "@/lib/viz/visuals";

type NodeData = { view: ViewNode; dimmed: boolean; emphasis: Map<string, NetworkEmphasis> };
type EdgeData = { view: ViewEdge; dimmed: boolean; onSelect: (id: string) => void };
type ServiceFlowNode = Node<NodeData, "service">;
type RiskFlowEdge = Edge<EdgeData, "risk">;

const BADGE_TONE: Record<string, string> = {
  add: "text-spectral border-spectral/45 bg-spectral/10",
  remove: "text-mist border-veil/45 bg-veil/10",
  dangling: "text-blood border-blood/45 bg-blood/10",
  change: "text-violet border-violet/35 bg-violet/[0.08]",
  unknown: "text-bile border-bile/40 bg-bile/10",
};

const hidden = "!h-1.5 !w-1.5 !min-h-0 !min-w-0 !border-0 !bg-transparent";

export function NetworkTagChip({ tag, emphasis, size = "sm" }: { tag: NetworkTag; emphasis?: NetworkEmphasis; size?: "sm" | "md" }) {
  const base = size === "sm" ? "px-1.5 py-px text-[10px]" : "px-2 py-0.5 text-[11px]";
  const state =
    tag.state === "proposed"
      ? "pm-proposed border-dashed border-spectral text-spectral bg-spectral/15"
      : tag.state === "added"
      ? "border-spectral/50 text-spectral"
      : tag.state === "removed"
        ? "border-dashed border-veil/60 text-veil line-through decoration-veil/80"
        : "border-violet/35 text-violet";
  const ring = emphasis === "lost" ? "ring-2 ring-blood/80 ring-offset-1 ring-offset-slab" : emphasis === "related" ? "ring-1 ring-spectral/70 ring-offset-1 ring-offset-slab" : "";
  const sign = tag.state === "added" || tag.state === "proposed" ? "+" : tag.state === "removed" ? "−" : "≋";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border bg-void/70 font-mono ${base} ${state} ${ring}`}
      data-network={tag.id}
      data-emphasis={emphasis ?? "none"}
    >
      <span aria-hidden="true">{sign}</span>
      <span className="sr-only">{tag.state === "proposed" ? "proposed network" : tag.state === "added" ? "added network" : tag.state === "removed" ? "removed network" : "network"} </span>
      {tag.label}
      {tag.implicit && <span className="text-veil">(implicit)</span>}
      {tag.external && <span className="text-veil">(ext)</span>}
      {emphasis === "lost" && <span className="font-sans text-[9px] font-semibold tracking-wide text-blood uppercase no-underline">lost</span>}
      {tag.state === "proposed" && <span className="font-sans text-[9px] font-semibold tracking-wide uppercase">preview</span>}
    </span>
  );
}

const ServiceNode = memo(function ServiceNode({ data, selected }: NodeProps<ServiceFlowNode>) {
  const { view: n, dimmed, emphasis } = data;
  const ghost = n.visual === "removed" || n.visual === "missing";
  const riskColor = n.risk && n.risk !== "info" ? severityVisual(n.risk).color : undefined;
  const badges = nodeBadges(n.visual, n.risk, n.unknowns.length > 0, n.danglingTarget, n.changeKinds);
  const ports = n.visual === "removed" ? n.ports.before : n.ports.after.length ? n.ports.after : n.ports.before;
  const frame = selected
    ? "border-spectral"
    : n.visual === "added"
      ? "border-spectral/70"
      : n.visual === "missing" || (n.visual === "removed" && n.danglingTarget)
        ? "border-blood/60 border-dashed"
        : ghost
          ? "border-veil/50 border-dashed"
          : n.visual === "changed"
            ? "border-violet/45"
            : "border-seam";

  return (
    <div
      className={`pm-node relative w-[220px] rounded-xl border px-3 py-2.5 text-left ${frame} ${ghost ? "pm-ghost" : "bg-slab/95 shadow-[0_10px_30px_-14px_rgb(0_0_0/0.9)]"} ${n.visual === "added" ? "pm-materialize" : ""} ${riskColor && !ghost ? "pm-node-risk" : ""} ${dimmed ? "pm-dim" : ""}`}
      style={riskColor ? ({ "--pm-risk": riskColor } as React.CSSProperties) : undefined}
      data-visual={n.visual}
    >
      <Handle type="target" position={Position.Left} id="l" className={hidden} isConnectable={false} />
      <Handle type="source" position={Position.Right} id="r" className={hidden} isConnectable={false} />
      <div className="flex items-center gap-2">
        <span aria-hidden="true" className={`text-sm ${ghost ? "text-veil" : n.visual === "added" ? "text-spectral" : "text-violet"}`}>
          {ghost ? "☽" : n.visual === "added" ? "✦" : "⬡"}
        </span>
        <span className={`truncate font-mono text-[13px] font-semibold ${ghost ? "text-mist" : "text-bone"}`}>{n.label}</span>
      </div>
      <div className="mt-0.5 truncate font-mono text-[10.5px] text-veil">{n.image ?? (n.visual === "missing" ? "never defined in AFTER" : "")}</div>
      {ports.length > 0 && <div className="mt-0.5 truncate font-mono text-[10.5px] text-mist">⇄ {ports.join("  ")}</div>}
      {(n.networks.length > 0 || n.networkModeLabel) && (
        <div className="mt-1.5 flex flex-wrap gap-1" aria-label="Networks">
          {n.networks.map((t) => (
            <NetworkTagChip key={t.id} tag={t} emphasis={dimmed ? undefined : emphasis.get(t.id)} />
          ))}
          {n.networkModeLabel && <span className="rounded-full border border-violet/35 bg-void/70 px-1.5 py-px font-mono text-[10px] text-violet">{n.networkModeLabel}</span>}
        </div>
      )}
      {badges.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {badges.map((b) => (
            <span
              key={b.text}
              className={`rounded border px-1.5 py-px text-[10px] font-medium ${b.tone === "severity" ? "" : BADGE_TONE[b.tone]}`}
              style={b.color ? { color: b.color, borderColor: `${b.color}70`, background: `${b.color}18` } : undefined}
            >
              {b.text}
            </span>
          ))}
        </div>
      )}
      {n.unknowns.length > 0 && <div className="pm-fog" aria-hidden="true" />}
    </div>
  );
});

const EDGE_GLYPH: Partial<Record<EdgeVisual, string>> = { broken: "✕", "at-risk": "!", isolated: "∅", added: "+", removed: "−", restored: "✓" };
const GAP = 26;

function RiskEdge(props: EdgeProps<RiskFlowEdge>) {
  const { id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data, selected, markerEnd } = props;
  const [path, bx, by] = getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition });
  const ref = useRef<SVGPathElement>(null);
  const [geo, setGeo] = useState<{ len: number; x: number; y: number; a: DOMPoint; b: DOMPoint } | null>(null);
  const spec = data ? edgeSpec(data.view.visual, data.view.kind) : null;

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || typeof el.getTotalLength !== "function") return;
    const len = el.getTotalLength();
    const mid = el.getPointAtLength(len / 2);
    setGeo({ len, x: mid.x, y: mid.y, a: el.getPointAtLength(len / 2 - GAP), b: el.getPointAtLength(len / 2 + GAP) });
  }, [path]);

  if (!data || !spec) return null;
  const { view, dimmed, onSelect } = data;
  const lx = geo?.x ?? bx;
  const ly = geo?.y ?? by;
  const severed = spec.severed && geo && geo.len > GAP * 3;
  const dash = severed ? `${geo.len / 2 - GAP} ${GAP * 2} ${geo.len}` : spec.dash;
  const showLabel = view.label && view.visual !== "isolated";
  const labelText = view.visual === "at-risk" ? `possibly: ${view.label}` : view.visual === "restored" ? `${view.label} · preview` : (view.label ?? "");

  return (
    <>
      <path
        ref={ref}
        id={id}
        d={path}
        fill="none"
        markerEnd={markerEnd}
        pathLength={spec.restore ? 1 : undefined}
        className={`react-flow__edge-path pm-edge-path ${spec.animated ? "pm-animated" : ""} ${spec.restore ? "pm-restore" : ""}`}
        style={{ stroke: spec.stroke, strokeWidth: selected ? spec.width + 1.5 : spec.width, strokeDasharray: spec.restore ? 1 : dash, opacity: dimmed ? 0.12 : spec.opacity }}
      />
      {severed && !dimmed && (
        // End caps either side of the cut make the break read as deliberate, not as a rendering gap.
        <g aria-hidden="true" fill={spec.stroke}>
          <circle cx={geo.a.x} cy={geo.a.y} r={3} />
          <circle cx={geo.b.x} cy={geo.b.y} r={3} />
        </g>
      )}
      <path d={path} fill="none" strokeOpacity={0} strokeWidth={18} className="react-flow__edge-interaction" />
      {showLabel && (
        <EdgeLabelRenderer>
          <button
            type="button"
            onClick={() => onSelect(id)}
            data-edge-label={id}
            className={`nodrag nopan absolute rounded-full border bg-void px-2 py-0.5 font-mono text-[10px] whitespace-nowrap ${dimmed ? "pm-dim" : ""}`}
            style={{ transform: `translate(-50%, ${severed ? "0" : "-50%"}) translate(${lx}px, ${severed ? ly + 14 : ly}px)`, color: spec.stroke, borderColor: `${spec.stroke}70`, pointerEvents: "all" }}
            // The accessible name ends with the exact visible text, so voice control can target what is shown.
            aria-label={`${EDGE_KIND_LABEL[view.kind]} ${view.source.slice(4)} to ${view.target.slice(4)}${view.visual === "broken" ? ", severed" : view.visual === "restored" ? ", in preview" : ""}: ${labelText}`}
          >
            <span aria-hidden="true">{EDGE_GLYPH[view.visual]} </span>
            {labelText}
          </button>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

const nodeTypes = { service: ServiceNode };
const edgeTypes = { risk: RiskEdge };

export interface FocusRequest {
  ids: string[];
  nonce: number;
}

interface Props {
  graph: ViewGraph;
  mode: ViewMode;
  highlight: Highlight | null;
  selectedId: string | null;
  focus: FocusRequest | null;
  /** File-level things the analysis could not resolve (e.g. `include`). Rendered as labeled fog. */
  fileUnknowns: string[];
  compact?: boolean;
  /** On compact screens, open centered on these nodes (the top risk) instead of the whole graph. */
  initialFocusIds?: string[];
  onSelectNode: (id: string) => void;
  onSelectEdge: (id: string) => void;
  onClear: () => void;
  onShowUnknowns: () => void;
}

function describeNode(n: ViewNode): string {
  const parts = [`Service ${n.label}`];
  if (n.visual !== "steady") parts.push(n.visual === "missing" ? "not defined" : n.visual === "removed" ? "removed, ghost of BEFORE" : n.visual);
  if (n.risk) parts.push(`${severityVisual(n.risk).label} risk`);
  if (n.networks.length) parts.push(`networks ${n.networks.map((t) => `${t.label}${t.state === "kept" ? "" : ` ${t.state}`}`).join(", ")}`);
  if (n.unknowns.length) parts.push("has unresolved settings");
  return parts.join(", ");
}

const EMPTY = new Map<string, NetworkEmphasis>();

export function GraphCanvas(props: Props) {
  const { graph, mode, highlight, selectedId, focus, fileUnknowns, compact, initialFocusIds, onSelectNode, onSelectEdge, onClear, onShowUnknowns } = props;
  const flow = useReactFlow();
  const emphasis = highlight?.networks ?? EMPTY;
  // Readable zoom for the opening view and "Go to" focusing on small screens.
  const minZoom = compact ? 0.55 : 0.3;
  // Lowest zoom anywhere, including the Fit control. On small screens it must sit well below the readable
  // zoom, or Fit cannot show a multi-column graph and clips its outer nodes. Desktop is unchanged (0.3).
  const fitFloor = compact ? 0.1 : 0.3;

  const nodes = useMemo<ServiceFlowNode[]>(
    () =>
      graph.nodes
        .filter((n) => n.kind === "service")
        .map((n) => ({
          id: n.id,
          type: "service" as const,
          position: n.position,
          data: { view: n, dimmed: highlight !== null && !highlight.ids.has(n.id), emphasis },
          selected: selectedId === n.id,
          draggable: false,
          connectable: false,
          ariaLabel: describeNode(n),
        })),
    [graph, highlight, selectedId, emphasis],
  );

  const edges = useMemo<RiskFlowEdge[]>(
    () =>
      graph.edges
        .filter((e) => e.kind !== "membership")
        // Undeclared isolation is low-confidence context: only drawn when the user asks about it.
        .filter((e) => e.visual !== "isolated" || (highlight !== null && highlight.ids.has(e.id)))
        .map((e) => {
          const spec = edgeSpec(e.visual, e.kind);
          return {
            id: e.id,
            type: "risk" as const,
            source: e.source,
            target: e.target,
            sourceHandle: "r",
            targetHandle: "l",
            selected: selectedId === e.id,
            zIndex: e.visual === "broken" || e.visual === "at-risk" ? 2 : 1,
            markerEnd: e.kind !== "lost-network" ? { type: "arrowclosed" as const, color: spec.stroke, width: 16, height: 16 } : undefined,
            ariaLabel: `${EDGE_KIND_LABEL[e.kind]} from ${e.source.slice(4)} to ${e.target.slice(4)}${e.label ? `: ${e.visual === "broken" ? "severed, " : ""}${e.label}` : ""}`,
            data: { view: e, dimmed: highlight !== null && !highlight.ids.has(e.id), onSelect: onSelectEdge },
          };
        }),
    [graph, highlight, selectedId, onSelectEdge],
  );

  // Runs once per mount (the canvas remounts per analyzed model).
  const initialIds = useRef(initialFocusIds);
  useEffect(() => {
    const ids = initialIds.current;
    if (!compact || !ids?.length) return;
    const t = window.setTimeout(() => void flow.fitView({ nodes: ids.map((id) => ({ id })), padding: "12%", minZoom, maxZoom: 0.85, duration: 0 }), 120);
    return () => window.clearTimeout(t);
  }, [compact, flow, minZoom]);

  useEffect(() => {
    if (!focus || focus.ids.length === 0) return;
    const ids = focus.ids.filter((id) => graph.nodes.some((n) => n.id === id && n.kind === "service"));
    if (ids.length === 0) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    void flow.fitView({ nodes: ids.map((id) => ({ id })), padding: "18%", maxZoom: 1.15, minZoom, duration: reduce ? 0 : 500 });
  }, [focus, flow, graph.nodes, minZoom]);

  return (
    <ReactFlow
      className="observatory-flow"
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      forceColorMode="dark"
      fitView
      fitViewOptions={{ padding: "6%", minZoom: fitFloor }}
      minZoom={fitFloor}
      maxZoom={1.8}
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable
      onNodeClick={(_, n) => onSelectNode(n.id)}
      onEdgeClick={(_, e) => onSelectEdge(e.id)}
      onPaneClick={onClear}
      // Nodes are controlled, so keyboard selection (Enter/Space on a focused element) arrives as a change.
      onNodesChange={(changes) => {
        const c = changes.getByType("select").find((x) => x.selected);
        if (c && c.id !== selectedId) onSelectNode(c.id);
      }}
      onEdgesChange={(changes) => {
        const c = changes.getByType("select").find((x) => x.selected);
        if (c && c.id !== selectedId) onSelectEdge(c.id);
      }}
      ariaLabelConfig={{
        "node.a11yDescription.default": "Press Enter or Space to inspect evidence for this item.",
        "edge.a11yDescription.default": "Press Enter or Space to inspect evidence for this relationship.",
      }}
    >
      <Background variant={BackgroundVariant.Dots} gap={22} size={1} color="#24222f" />
      <Controls showInteractive={false} position="bottom-left" aria-label="Graph zoom controls" />
      {fileUnknowns.length > 0 && (
        <FlowPanel position="top-right" className="!m-2">
          <button type="button" onClick={onShowUnknowns} className="pm-fog-banner rounded-lg border border-bile/35 px-2.5 py-1.5 text-left text-[11px] text-bile">
            <span aria-hidden="true">≈ </span>
            Fog: {fileUnknowns.length} setting{fileUnknowns.length === 1 ? "" : "s"} outside this analysis
            <span className="block text-[10px] text-mist">Parts of the deployment may not be shown. Uncertain.</span>
          </button>
        </FlowPanel>
      )}
      <span className="sr-only" aria-live="polite">
        {`Showing ${mode === "diff" ? "changes" : mode.toUpperCase()} view: ${nodes.length} services, ${graph.edges.filter((e) => e.visual === "broken").length} severed and ${graph.edges.filter((e) => e.visual === "at-risk").length} possibly affected relationships.`}
      </span>
    </ReactFlow>
  );
}
