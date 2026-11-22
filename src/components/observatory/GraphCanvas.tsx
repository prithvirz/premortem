"use client";

import {
  Background,
  BackgroundVariant,
  BaseEdge,
  Controls,
  EdgeLabelRenderer,
  Handle,
  Position,
  ReactFlow,
  getBezierPath,
  useReactFlow,
  type Edge,
  type EdgeProps,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import { memo, useEffect, useMemo } from "react";
import type { ViewMode } from "@/lib/viz/graph";
import type { EdgeVisual, ViewEdge, ViewGraph, ViewNode } from "@/lib/viz/view";
import { EDGE_KIND_LABEL, edgeSpec, nodeBadges, severityVisual } from "@/lib/viz/visuals";

type NodeData = { view: ViewNode; dimmed: boolean; mode: ViewMode };
type EdgeData = { view: ViewEdge; dimmed: boolean; onSelect: (id: string) => void };
type ServiceFlowNode = Node<NodeData, "service">;
type NetworkFlowNode = Node<NodeData, "network">;
type RiskFlowEdge = Edge<EdgeData, "risk">;

const TONE: Record<string, string> = {
  risk: "text-ember border-ember/40 bg-ember/10",
  add: "text-spectral border-spectral/40 bg-spectral/10",
  remove: "text-mist border-veil/40 bg-veil/10",
  neutral: "text-violet border-violet/40 bg-violet/10",
  unknown: "text-bile border-bile/40 bg-bile/10",
};

const hidden = "!h-1.5 !w-1.5 !min-h-0 !min-w-0 !border-0 !bg-transparent";

const ServiceNode = memo(function ServiceNode({ data, selected }: NodeProps<ServiceFlowNode>) {
  const { view: n, dimmed } = data;
  const ghost = n.visual === "removed" || n.visual === "missing";
  const riskColor = n.risk && n.risk !== "info" ? severityVisual(n.risk).color : undefined;
  const badges = nodeBadges(n.visual, n.risk, n.unknowns.length > 0, n.danglingTarget);
  const ports = data.mode === "before" ? n.ports.before : n.ports.after.length || data.mode === "after" ? n.ports.after : n.ports.before;
  const border = selected
    ? "border-spectral"
    : n.visual === "added"
      ? "border-spectral/60"
      : n.visual === "missing" || (n.visual === "removed" && n.danglingTarget)
        ? "border-blood/70 border-dashed"
        : ghost
          ? "border-veil/50 border-dashed"
          : n.visual === "changed"
            ? "border-violet/60"
            : "border-seam";

  return (
    <div
      className={`pm-node relative w-[210px] rounded-xl border bg-slab/95 px-3 py-2.5 text-left shadow-[0_8px_30px_-12px_rgb(0_0_0/0.8)] ${border} ${ghost ? "pm-node-ghost opacity-75" : ""} ${riskColor && !ghost ? "pm-node-risk" : ""} ${dimmed ? "pm-dim" : ""}`}
      style={riskColor ? ({ "--pm-risk": riskColor } as React.CSSProperties) : undefined}
    >
      <Handle type="target" position={Position.Left} id="l" className={hidden} isConnectable={false} />
      <Handle type="source" position={Position.Right} id="r" className={hidden} isConnectable={false} />
      <Handle type="source" position={Position.Bottom} id="b" className={hidden} isConnectable={false} />
      <div className="flex items-center gap-2">
        <span aria-hidden="true" className={`text-sm ${ghost ? "text-veil" : "text-violet"}`}>
          {ghost ? "☽" : "⬡"}
        </span>
        <span className={`truncate font-mono text-[13px] font-semibold ${ghost ? "text-mist line-through decoration-veil/70" : "text-bone"}`}>{n.label}</span>
      </div>
      <div className="mt-0.5 truncate font-mono text-[10.5px] text-veil">{n.image ?? (n.visual === "missing" ? "not defined in this version" : "")}</div>
      {ports.length > 0 && <div className="mt-1 truncate font-mono text-[10.5px] text-mist">⇄ {ports.join("  ")}</div>}
      {badges.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {badges.map((b) => (
            <span key={b.text} className={`rounded border px-1.5 py-px text-[10px] font-medium ${TONE[b.tone]}`}>
              {b.text}
            </span>
          ))}
        </div>
      )}
    </div>
  );
});

const NetworkNode = memo(function NetworkNode({ data, selected }: NodeProps<NetworkFlowNode>) {
  const { view: n, dimmed } = data;
  const tone = n.visual === "added" ? "text-spectral border-spectral/50" : n.visual === "removed" ? "text-veil border-veil/50 border-dashed" : "text-violet border-violet/40";
  return (
    <div className={`pm-node w-[150px] rounded-full border bg-void/90 px-3 py-1.5 text-center ${tone} ${selected ? "!border-spectral" : ""} ${dimmed ? "pm-dim" : ""}`}>
      <Handle type="target" position={Position.Top} id="t" className={hidden} isConnectable={false} />
      <div className="truncate font-mono text-[11px]">
        <span aria-hidden="true">≋ </span>
        {n.implicit ? "default" : n.label}
        {n.external ? " (external)" : ""}
      </div>
      {n.implicit && <div className="text-[9.5px] tracking-wider text-veil uppercase">implicit</div>}
      {(n.visual === "added" || n.visual === "removed") && <div className="text-[9.5px] tracking-wider uppercase">{n.visual}</div>}
    </div>
  );
});

const EDGE_GLYPH: Partial<Record<EdgeVisual, string>> = { broken: "✕", "at-risk": "!", isolated: "∅", added: "+", removed: "−" };

function RiskEdge(props: EdgeProps<RiskFlowEdge>) {
  const { id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data, selected, markerEnd } = props;
  const [path, lx, ly] = getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition });
  if (!data) return null;
  const { view, dimmed, onSelect } = data;
  const spec = edgeSpec(view.visual, view.kind);
  const showLabel = view.label && view.kind !== "membership" && view.visual !== "isolated";
  const color = spec.stroke;
  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        markerEnd={markerEnd}
        className={`pm-edge-path ${spec.animated ? "pm-animated" : ""}`}
        interactionWidth={18}
        style={{
          stroke: color,
          strokeWidth: selected ? spec.width + 1.5 : spec.width,
          strokeDasharray: spec.dash,
          opacity: dimmed ? 0.12 : spec.opacity,
        }}
      />
      {showLabel && (
        <EdgeLabelRenderer>
          <button
            type="button"
            onClick={() => onSelect(id)}
            className={`nodrag nopan absolute rounded-full border bg-void/95 px-2 py-0.5 font-mono text-[10px] whitespace-nowrap ${dimmed ? "pm-dim" : ""}`}
            style={{ transform: `translate(-50%, -50%) translate(${lx}px, ${ly}px)`, color, borderColor: `${color}66`, pointerEvents: "all" }}
            aria-label={`${EDGE_KIND_LABEL[view.kind]} ${view.source.slice(4)} to ${view.target.slice(4)}: ${view.label}`}
          >
            <span aria-hidden="true">{EDGE_GLYPH[view.visual]} </span>
            {view.label}
          </button>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

const nodeTypes = { service: ServiceNode, network: NetworkNode };
const edgeTypes = { risk: RiskEdge };

export interface FocusRequest {
  ids: string[];
  nonce: number;
}

interface Props {
  graph: ViewGraph;
  /** Changes only when the unified model changes; triggers a re-fit. */
  layoutKey: string;
  mode: ViewMode;
  highlight: Set<string> | null;
  selectedId: string | null;
  focus: FocusRequest | null;
  onSelectNode: (id: string) => void;
  onSelectEdge: (id: string) => void;
  onClear: () => void;
}

function describeNode(n: ViewNode): string {
  if (n.kind === "network") return `Network ${n.label}${n.visual !== "steady" ? `, ${n.visual}` : ""}`;
  const parts = [`Service ${n.label}`];
  if (n.visual !== "steady") parts.push(n.visual === "missing" ? "not defined" : n.visual);
  if (n.risk) parts.push(`${severityVisual(n.risk).label} risk`);
  if (n.unknowns.length) parts.push("has unresolved settings");
  return parts.join(", ");
}

export function GraphCanvas({ graph, layoutKey, mode, highlight, selectedId, focus, onSelectNode, onSelectEdge, onClear }: Props) {
  const flow = useReactFlow();

  const nodes = useMemo<(ServiceFlowNode | NetworkFlowNode)[]>(
    () =>
      graph.nodes.map((n) => ({
        id: n.id,
        type: n.kind,
        position: n.position,
        data: { view: n, dimmed: highlight !== null && !highlight.has(n.id), mode },
        selected: selectedId === n.id,
        draggable: false,
        connectable: false,
        ariaLabel: describeNode(n),
      })),
    [graph, highlight, selectedId, mode],
  );

  const edges = useMemo<RiskFlowEdge[]>(
    () =>
      graph.edges
        // Undeclared isolation is low-confidence context: only drawn when the user asks about it.
        .filter((e) => e.visual !== "isolated" || (highlight !== null && highlight.has(e.id)))
        .map((e) => {
        const isMembership = e.kind === "membership";
        const spec = edgeSpec(e.visual, e.kind);
        return {
          id: e.id,
          type: "risk",
          source: e.source,
          target: e.target,
          sourceHandle: isMembership ? "b" : "r",
          targetHandle: isMembership ? "t" : "l",
          selected: selectedId === e.id,
          focusable: !isMembership,
          zIndex: e.visual === "broken" || e.visual === "at-risk" ? 2 : isMembership ? 0 : 1,
          markerEnd:
            e.kind === "depends_on" || e.kind === "links" || e.kind === "network_mode"
              ? { type: "arrowclosed" as const, color: spec.stroke, width: 16, height: 16 }
              : undefined,
          ariaLabel: `${EDGE_KIND_LABEL[e.kind]} from ${e.source.slice(4)} to ${e.target.slice(4)}${e.label ? `: ${e.label}` : ""}`,
          data: { view: e, dimmed: highlight !== null && !highlight.has(e.id), onSelect: onSelectEdge },
        };
      }),
    [graph, highlight, selectedId, onSelectEdge],
  );

  // Re-fit when the set of nodes changes (new scenario or edited files), not on mode toggles,
  // so switching Before/Changes/After keeps the camera still.
  useEffect(() => {
    const t = window.setTimeout(() => void flow.fitView({ padding: 0.15, duration: 0 }), 30);
    return () => window.clearTimeout(t);
  }, [layoutKey, flow]);

  useEffect(() => {
    if (!focus || focus.ids.length === 0) return;
    const ids = focus.ids.filter((id) => graph.nodes.some((n) => n.id === id));
    if (ids.length === 0) return;
    const reduce = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    void flow.fitView({ nodes: ids.map((id) => ({ id })), padding: 0.6, maxZoom: 1.15, duration: reduce ? 0 : 500 });
  }, [focus, flow, graph.nodes]);

  return (
    <ReactFlow
      className="observatory-flow"
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      forceColorMode="dark"
      fitView
      fitViewOptions={{ padding: 0.15 }}
      minZoom={0.3}
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
      proOptions={{ hideAttribution: false }}
      ariaLabelConfig={{
        "node.a11yDescription.default": "Press Enter or Space to inspect evidence for this item.",
        "edge.a11yDescription.default": "Press Enter or Space to inspect evidence for this relationship.",
      }}
    >
      <Background variant={BackgroundVariant.Dots} gap={22} size={1} color="#2a2836" />
      <Controls showInteractive={false} position="bottom-right" aria-label="Graph zoom controls" />
      <span className="sr-only" aria-live="polite">
        {`Showing ${mode === "diff" ? "changes" : mode.toUpperCase()} view: ${graph.nodes.filter((n) => n.kind === "service").length} services, ${graph.edges.filter((e) => e.visual === "broken").length} broken and ${graph.edges.filter((e) => e.visual === "at-risk").length} at-risk relationships.`}
      </span>
    </ReactFlow>
  );
}
