import { useEffect, useMemo, useState } from "react";
import { ReactFlow, Controls, Background, MiniMap, useNodesState, useEdgesState, MarkerType, Position, type Node, type Edge } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import ELK from "elkjs/lib/elk.bundled.js";

import type { LRItemSet } from "../compiler/interface/itemSet";
import type { LRItem } from "../compiler/interface/lrItem";
import type { BNFElement } from "../compiler/interface/bnf";

type Props = {
  lrItemSets: LRItemSet[];
  terminals: Set<string>; // ← 終端の集合を渡す
};

const elk = new ELK();

function fmtElementsWithDot(elements: BNFElement[], dotPos: number): string {
  const parts: string[] = [];
  for (let i = 0; i <= elements.length; i++) {
    if (i === dotPos) parts.push("•");
    if (i < elements.length) {
      const e = elements[i];
      const v = e.getType() === "terminal" ? `'${e.getValue()}'` : e.getValue();
      parts.push(v);
    }
  }
  return parts.join(" ");
}

function fmtItem(item: LRItem): string {
  const concat = item.getConcatenation();
  const left = concat.getLeft();
  const elements = concat.getElements();
  return `${left} → ${fmtElementsWithDot(elements, item.getDotPosition())}`;
}

const cardStyle: React.CSSProperties = {
  padding: 8,
  borderRadius: 10,
  border: "1px solid #e5e7eb",
  background: "white",
  width: 300,
  maxHeight: 200,
  overflow: "auto",
  textAlign: "left",
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
  fontSize: 12,
  lineHeight: 1.35,
  whiteSpace: "pre-wrap",
};

const titleStyle: React.CSSProperties = { fontWeight: 700, marginBottom: 6 };

const isAccepting = (items: LRItem[]): boolean => {
  // ドットが末尾にある S* → ... • を受理扱い
  return items.some((it) => {
    const c = it.getConcatenation();
    return it.getDotPosition() >= c.getElements().length && c.getLeft().startsWith("S");
  });
};

export default function AutomatonGraph({ lrItemSets, terminals }: Props) {
  // ---- 初期 nodes/edges（データ→見た目）
  const baseNodes = useMemo<Node[]>(() => {
    return lrItemSets.map((set, i) => {
      const items = set.getLRItems();
      const label = items.map(fmtItem).join("\n");
      const accepting = isAccepting(items);

      return {
        id: String(i),
        position: { x: 0, y: 0 }, // レイアウトで後から埋める
        data: {
          label: (
            <div style={cardStyle}>
              <div style={titleStyle}>
                I{i} {accepting ? " (✓)" : ""}
              </div>
              <div>{label || "(no items)"}</div>
            </div>
          ),
        },
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
        draggable: true,
        selectable: true,
        style: {
          width: 340,
          borderRadius: 12,
          boxShadow: "0 1px 2px rgba(0,0,0,0.06)",
          border: accepting ? "2px solid #10b981" : "1px solid #e5e7eb",
        },
      } satisfies Node;
    });
  }, [lrItemSets]);

  const baseEdges = useMemo<Edge[]>(() => {
    const edges: Edge[] = [];
    lrItemSets.forEach((set, i) => {
      set.getGotos().forEach((targetIndex, symbol) => {
        const isTerm = terminals.has(symbol);
        const isEof = symbol === "EoF";
        edges.push({
          id: `e-${i}-${symbol}-${targetIndex}`,
          source: String(i),
          target: String(targetIndex),
          label: symbol,
          labelStyle: { fontSize: 12 },
          markerEnd: { type: MarkerType.ArrowClosed },
          style: {
            strokeWidth: isEof ? 2.2 : 1.6,
            strokeDasharray: isTerm ? "0" : "6 4", // 非終端=破線
          },
          animated: false,
        });
      });
    });
    return edges;
  }, [lrItemSets, terminals]);

  const [nodes, setNodes, onNodesChange] = useNodesState(baseNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(baseEdges);

  // ---- 自動レイアウト（ELK）
  const [layingOut, setLayingOut] = useState(false);

  const runLayout = async () => {
    setLayingOut(true);
    const graph = {
      id: "lr-graph",
      layoutOptions: {
        "elk.algorithm": "layered",
        "elk.layered.spacing.nodeNodeBetweenLayers": "60",
        "elk.spacing.nodeNode": "40",
        "elk.direction": "RIGHT", // 左→右
        "elk.layered.nodePlacement.bk.fixedAlignment": "BALANCED",
      },
      children: nodes.map((n) => ({
        id: n.id,
        width: 300,
        height: 160,
      })),
      edges: edges.map((e) => ({ id: e.id, sources: [e.source], targets: [e.target] })),
    } as const;

    const res = await elk.layout(graph);
    const nextNodes = nodes.map((n) => {
      const g = res.children?.find((c) => c.id === n.id);
      return g ? { ...n, position: { x: g.x ?? 0, y: g.y ?? 0 } } : n;
    });
    setNodes(nextNodes);
    setLayingOut(false);
  };

  // 初回 & データ変化時に一度だけ整列
  useEffect(() => {
    setNodes(baseNodes);
    setEdges(baseEdges);
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    runLayout();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseNodes, baseEdges]);

  return (
    <div style={{ width: "100%", height: "80vh", position: "relative" }}>
      {/* 凡例/操作 */}
      <div
        style={{
          position: "absolute",
          zIndex: 10,
          top: 8,
          left: 8,
          background: "white",
          border: "1px solid #e5e7eb",
          padding: "8px 10px",
          borderRadius: 8,
          fontSize: 12,
          display: "flex",
          gap: 12,
          alignItems: "center",
        }}
      >
        <span style={{ fontWeight: 700 }}>Legend</span>
        <span>終端: 実線</span>
        <span>非終端: 破線</span>
        <span>受理: 緑枠</span>
        <span>{layingOut ? "整列中…" : ""}</span>
        <button
          onClick={runLayout}
          style={{
            marginLeft: 8,
            padding: "4px 8px",
            border: "1px solid #d1d5db",
            borderRadius: 6,
            background: "#f9fafb",
            cursor: "pointer",
          }}
        >
          Re-layout
        </button>
      </div>

      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        proOptions={{ hideAttribution: true }}
      >
        <MiniMap pannable zoomable nodeColor={(n) => (String(n.data?.label).includes("(✓)") ? "#a7f3d0" : "#e5e7eb")} maskColor="rgba(0,0,0,0.08)" />
        <Controls showInteractive={false} />
        <Background />
      </ReactFlow>
    </div>
  );
}
