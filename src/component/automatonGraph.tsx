import { useEffect, useMemo, useState, useRef } from "react";
import {
  Handle,
  ReactFlow,
  Controls,
  Background,
  MiniMap,
  useNodesState,
  useEdgesState,
  MarkerType,
  Position,
  useUpdateNodeInternals,
  ReactFlowProvider,
  type Node,
  type Edge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import ELK from "elkjs/lib/elk.bundled.js";

import type { LRItemSet } from "../compiler/interface/itemSet";
import type { LRItem } from "../compiler/interface/lrItem";
import type { BNFElement } from "../compiler/interface/bnf";
import { encryptSha256 } from "../helper/hash.js";
import { BaseEdge, type EdgeProps } from "@xyflow/react";

function SelfLoopEdge({ id, sourceX, sourceY, targetX, targetY, markerEnd, style, interactionWidth }: EdgeProps) {
  const r = 100; // 半径（data.radius を使うなら Number(data?.radius) ?? 26 に）
  // 右から出て右上を回り、上へ戻る
  const d = `M ${sourceX},${sourceY} C ${sourceX + r},${sourceY - r} ${targetX + r},${targetY - r} ${targetX},${targetY}`;

  return (
    <BaseEdge
      id={id}
      path={d}
      markerEnd={markerEnd} // ← これで矢印が付く
      style={style}
      interactionWidth={interactionWidth ?? 24}
    />
  );
}
// ReactFlow に登録
const edgeTypes = { selfLoop: SelfLoopEdge };

// JSX

// ===== サイズ定数 =====
const NODE_W = 300;
const NODE_H = 160;
const HANDLE_OUT = 18; // 好みで 8〜14px

// ===== カスタムノード =====
function LrStateNode({ data }: { data: { title: string; body: string; accepting: boolean; version: string } }) {
  return (
    // ここで version を key にしてノードを必ず再マウント
    <div key={data.version} style={{ width: NODE_W, background: "transparent", border: "none" }}>
      <div
        style={{
          padding: 8,
          borderRadius: 10,
          border: data.accepting ? "2px solid #10b981" : "1px solid #e5e7eb",
          background: "white",
          width: NODE_W,
          maxHeight: 200,
          overflow: "auto",
          textAlign: "left",
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
          fontSize: 12,
          lineHeight: 1.35,
          whiteSpace: "pre-wrap",
        }}
      >
        <div style={{ fontWeight: 700, marginBottom: 6 }}>{data.title}</div>
        <div>{data.body || "(no items)"}</div>
      </div>
      <Handle type="source" id="right" position={Position.Right} style={{ right: -HANDLE_OUT }} />
      <Handle type="target" id="right" position={Position.Right} style={{ right: -HANDLE_OUT }} />
      <Handle type="source" id="left" position={Position.Left} />
      <Handle type="target" id="left" position={Position.Left} />
      <Handle type="source" id="top" position={Position.Top} />
      <Handle type="target" id="top" position={Position.Top} />
      <Handle type="source" id="bottom" position={Position.Bottom} />
      <Handle type="target" id="bottom" position={Position.Bottom} />
    </div>
  );
}
const nodeTypes = { lrState: LrStateNode };

type Props = {
  lrItemSets: LRItemSet[];
  terminals: Set<string>;
};

const elk = new ELK();

// === 方向判定（4方向）===
function pickHandles(a: { x: number; y: number }, b: { x: number; y: number }) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return { sourceHandle: "top", targetHandle: "right" };
  const SAME_ROW = Math.abs(dy) < 20;
  const SAME_COL = Math.abs(dx) < 20;
  if (SAME_ROW) return dx >= 0 ? { sourceHandle: "right", targetHandle: "left" } : { sourceHandle: "left", targetHandle: "right" };
  if (SAME_COL) return dy >= 0 ? { sourceHandle: "bottom", targetHandle: "top" } : { sourceHandle: "top", targetHandle: "bottom" };
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? { sourceHandle: "right", targetHandle: "left" } : { sourceHandle: "left", targetHandle: "right" };
  return dy >= 0 ? { sourceHandle: "bottom", targetHandle: "top" } : { sourceHandle: "top", targetHandle: "bottom" };
}

// ---- BNF 表示ヘルパー
function readElem(e: any): { type: "terminal" | "nonterminal"; value: string } {
  const type = typeof e?.getType === "function" ? e.getType() : e?.type;
  const value = typeof e?.getValue === "function" ? e.getValue() : e?.value;
  return { type, value };
}
function fmtElementsWithDot(elements: BNFElement[], dotPos: number): string {
  const parts: string[] = [];
  for (let i = 0; i <= elements.length; i++) {
    if (i === dotPos) parts.push("•");
    if (i < elements.length) {
      const e = readElem((elements as any)[i]);
      parts.push(e.type === "terminal" ? `'${e.value}'` : e.value);
    }
  }
  return parts.join(" ");
}
function fmtItem(item: LRItem): string {
  const c = item.getConcatenation();
  return `${c.getLeft()} → ${fmtElementsWithDot(c.getElements() as any, item.getDotPosition())}`;
}
const isAccepting = (items: LRItem[]): boolean =>
  items.some((it) => {
    const c = it.getConcatenation();
    return it.getDotPosition() >= c.getElements().length && c.getLeft().startsWith("S");
  });

// ---- 深いスナップショット→確実な hash
function snapshotItem(item: LRItem) {
  const c = item.getConcatenation();
  return {
    left: c.getLeft(),
    elements: (c.getElements() as any[]).map(readElem),
    dot: item.getDotPosition(),
  };
}
function snapshotSet(set: LRItemSet) {
  const items = set.getLRItems().map(snapshotItem);
  const gotos: Array<{ sym: string; to: number }> = [];
  set.getGotos().forEach((to, sym) => gotos.push({ sym, to }));
  gotos.sort((a, b) => (a.sym < b.sym ? -1 : a.sym > b.sym ? 1 : 0));
  return { items, gotos };
}
function computeGraphKeyDeep(lrItemSets: LRItemSet[]) {
  return encryptSha256(JSON.stringify(lrItemSets.map(snapshotSet)));
}

export default function AutomatonGraph({ lrItemSets, terminals }: Props) {
  const graphKey = computeGraphKeyDeep(lrItemSets);
  const shortKey = graphKey.slice(0, 8); // id に混ぜる用
  const idOf = (i: number) => `I${i}-${shortKey}`;

  // ---- データ→見た目
  const baseNodes = useMemo<Node[]>(() => {
    return lrItemSets.map((set, i) => {
      const items = set.getLRItems();
      const body = items.map(fmtItem).join("\n");
      const accepting = isAccepting(items);
      return {
        id: idOf(i), // ★ id に version を混ぜる
        type: "lrState",
        position: { x: 0, y: 0 },
        data: {
          title: `I${i}${accepting ? " (✓)" : ""}`,
          body,
          accepting,
          version: graphKey, // カスタムノード内部の key 用
        },
        style: { width: NODE_W, background: "transparent", border: "none", boxShadow: "none" },
        draggable: true,
        selectable: true,
      } satisfies Node;
    });
  }, [graphKey, lrItemSets.length]);

  const baseEdges = useMemo<Edge[]>(() => {
    const edges: Edge[] = [];
    const loopCount = new Map<number, number>(); // nodeごとの自己ループ数
    lrItemSets.forEach((set, i) => {
      set.getGotos().forEach((targetIndex, symbol) => {
        console.log("baseEdges", i, targetIndex, symbol);
        const to = Number(targetIndex);
        const isTerm = terminals.has(symbol);

        if (to === i) {
          const k = (loopCount.get(i) ?? 0) + 1;
          loopCount.set(i, k);

          edges.push({
            id: `e-${i}-${symbol}-${to}-${shortKey}`,
            source: idOf(i),
            target: idOf(to),
            label: symbol,
            type: "selfLoop", // ← ここがポイント
            sourceHandle: "right", // ノード側に存在するhandleだけ使う
            targetHandle: "top",
            data: { radius: 26 + (k - 1) * 10 }, // 2本目以降は少し外側へ
            markerEnd: { type: MarkerType.ArrowClosed },
            style: {
              strokeWidth: 2.4,
              strokeDasharray: isTerm ? "0" : "6 4",
            },
            interactionWidth: 24,
          });
          return;
        }

        edges.push({
          id: `e-${i}-${symbol}-${targetIndex}-${shortKey}`, // ★ edge も version を混ぜる
          source: idOf(i),
          target: idOf(Number(targetIndex)),
          label: symbol,
          labelStyle: { fontSize: 12 },
          markerEnd: { type: MarkerType.ArrowClosed },
          style: {
            strokeWidth: 2.2,
            strokeDasharray: isTerm ? "0" : "6 4",
          },
          animated: false,
        });
      });
    });
    return edges;
  }, [graphKey, terminals]);

  const [nodes, setNodes, onNodesChange] = useNodesState(baseNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(baseEdges);

  // ---- 自動レイアウト（ELK）
  const [layingOut, setLayingOut] = useState(false);
  const updateNodeInternals = useUpdateNodeInternals();
  // 先頭で
  const latestKeyRef = useRef(graphKey);
  useEffect(() => {
    latestKeyRef.current = graphKey;
  }, [graphKey]);
  // 受け取る側（state を直接使わない）
  const runLayout = async (keyAtStart: string, nodesSnap: Node[], edgesSnap: Edge[]) => {
    setLayingOut(true);
    try {
      const graph = {
        id: "lr-graph",
        layoutOptions: {
          "elk.algorithm": "layered",
          "elk.direction": "RIGHT",
          "elk.layered.spacing.nodeNodeBetweenLayers": "60",
          "elk.spacing.nodeNode": "40",
          "elk.layered.nodePlacement.bk.fixedAlignment": "BALANCED",
        },
        children: nodesSnap.map((n) => ({ id: n.id, width: NODE_W, height: NODE_H })),
        edges: edgesSnap.map((e) => ({ id: e.id, sources: [e.source], targets: [e.target] })),
      } as const;

      const res = await elk.layout(graph);

      // ★ 旧ジョブ破棄
      if (latestKeyRef.current !== keyAtStart) return;

      const nextNodes = nodesSnap.map((n) => {
        const g = res.children?.find((c) => c.id === n.id);
        return g ? { ...n, position: { x: g.x ?? 0, y: g.y ?? 0 } } : n;
      });

      const nodeMap = new Map(nextNodes.map((n) => [n.id, n]));
      const routedEdges = edgesSnap.map((e) => {
        const s = nodeMap.get(e.source);
        const t = nodeMap.get(e.target);

        if (!s || !t) return e;

        const a = { x: s.position.x + NODE_W / 2, y: s.position.y + NODE_H / 2 };
        const b = { x: t.position.x + NODE_W / 2, y: t.position.y + NODE_H / 2 };
        const { sourceHandle, targetHandle } = pickHandles(a, b);

        return { ...e, sourceHandle, targetHandle };
      });
      // ★ セットはここで一発
      setNodes(nextNodes);
      setEdges(routedEdges);
    } catch (err) {
      console.error("ELK layout failed:", err);
    } finally {
      if (latestKeyRef.current === keyAtStart) setLayingOut(false);
    }
  };

  // 呼ぶ側（useEffect & リレイアウトボタン）
  useEffect(() => {
    setNodes(() => [...baseNodes]);
    setEdges(() => [...baseEdges]);
    (async () => {
      await runLayout(graphKey, baseNodes, baseEdges); // ★ スナップショットを渡す
      baseNodes.forEach((n) => updateNodeInternals(n.id));
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graphKey, baseNodes, baseEdges]);

  // ボタンも同様に
  <button onClick={() => runLayout(graphKey, baseNodes, baseEdges)}>Re-layout</button>;

  return (
    <div style={{ width: "100%", height: "80vh", position: "relative" }}>
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
          onClick={() => runLayout(graphKey, baseNodes, baseEdges)}
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
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        proOptions={{ hideAttribution: true }}
      >
        <MiniMap
          pannable
          zoomable
          nodeColor={(n) => (String((n.data as any)?.title ?? "").includes("(✓)") ? "#a7f3d0" : "#e5e7eb")}
          maskColor="rgba(0,0,0,0.08)"
        />
        <Controls showInteractive={false} />
        <Background />
      </ReactFlow>
    </div>
  );
}
