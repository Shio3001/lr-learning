import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Background,
  BaseEdge,
  Controls,
  EdgeLabelRenderer,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  ReactFlowProvider,
  Handle,
  addEdge,
  getBezierPath,
  type Connection,
  type Edge as RFEdge,
  type EdgeProps,
  type Node as RFNode,
  type NodeProps,
  type NodeTypes,
  type EdgeTypes,
  useEdgesState,
  useNodesState,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import ELK from "elkjs/lib/elk.bundled.js";

import type { LRItemSet } from "../compiler/interface/itemSet";
import type { LRItem } from "../compiler/interface/lrItem";

// ====== 型定義 ======
type DrawNodeData = {
  title: string;
  accepting: boolean;
  isStart: boolean;
  onToggleAccept: (id: string) => void;
  onToggleStart: (id: string) => void;
  onTitleChange: (id: string, v: string) => void;
};

type DrawNode = RFNode<DrawNodeData>;
type DrawEdge = RFEdge;

// ====== ユーティリティ ======

// cubic Bézier の点を t で求める
const bz = (t: number, p0: number, p1: number, p2: number, p3: number) => {
  const u = 1 - t;
  return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3;
};

function isAcceptingFromItems(items: LRItem[]): boolean {
  return items.some((it) => {
    const c = it.getConcatenation();
    return it.getDotPosition() >= c.getElements().length && c.getLeft().startsWith("S");
  });
}

// ====== カスタム・エッジ ======

function SelfLoopEdge({ id, sourceX, sourceY, targetX, targetY, label, style, interactionWidth, data }: EdgeProps) {
  const r = Math.max(42, Number((data as any)?.radius) || 26);
  const pad = 0;

  const sx = sourceX,
    sy = sourceY - pad;
  const ex = targetX,
    ey = targetY - pad;

  const c1x = sx + r,
    c1y = sy - r * 2;
  const c2x = ex - r,
    c2y = ey - r * 2;

  const d = `M ${sx},${sy} C ${c1x},${c1y} ${c2x},${c2y} ${ex},${ey}`;

  const t = 0.5;
  const labelX = bz(t, sx, c1x, c2x, ex);
  const labelY = bz(t, sy, c1y, c2y, ey) - 8;

  return (
    <>
      <BaseEdge id={id} path={d} style={{ strokeLinecap: "round", ...(style || {}) }} interactionWidth={interactionWidth ?? 24} />
      <EdgeLabelRenderer>
        <div
          className="nodrag nopan"
          style={{
            position: "absolute",
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            background: "white",
            padding: "2px 4px",
            borderRadius: 4,
            fontSize: 12,
            boxShadow: "0 0 0 1px rgba(0,0,0,0.05)",
          }}
        >
          {label}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

function EditableEdge(props: EdgeProps) {
  const { id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, markerEnd, style, data } = props;
  const [edgePath, labelX, labelY] = getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition });

  const [editing, setEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const onCommit = (val: string) => {
    (data as any)?.onLabelChange?.(id, val);
    setEditing(false);
  };

  return (
    <>
      <BaseEdge id={id} path={edgePath} style={{ strokeLinecap: "round", ...(style || {}) }} markerEnd={markerEnd} />
      <EdgeLabelRenderer>
        <div
          className="nodrag nopan"
          style={{
            position: "absolute",
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            background: "white",
            padding: "2px 4px",
            borderRadius: 4,
            fontSize: 12,
            boxShadow: "0 0 0 1px rgba(0,0,0,0.05)",
            cursor: "text",
            minWidth: 16,
          }}
          onDoubleClick={() => setEditing(true)}
        >
          {editing ? (
            <input
              ref={inputRef}
              defaultValue={String(props.label ?? "")}
              onBlur={(e) => onCommit(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") onCommit((e.target as HTMLInputElement).value);
                if (e.key === "Escape") setEditing(false);
              }}
              style={{ fontSize: 12, border: "1px solid #ddd", borderRadius: 3, padding: "1px 3px", width: 120 }}
            />
          ) : (
            <span>{String(props.label ?? "") || "(ダブルクリックで編集)"}</span>
          )}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

const edgeTypes: EdgeTypes = {
  editable: EditableEdge,
  selfLoop: SelfLoopEdge,
};

// ====== カスタム・ノード ======

const NODE_W = 300;
const NODE_H = 160;
const HANDLE_OUT = 18;

function DrawStateNode({ id, data }: NodeProps<DrawNode>) {
  return (
    <div style={{ width: NODE_W, background: "transparent", border: "none" }}>
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
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <input
            value={data.title}
            onChange={(e) => data.onTitleChange(id, e.currentTarget.value)}
            style={{ fontWeight: 700, border: "1px solid #e5e7eb", borderRadius: 6, padding: "2px 6px", width: 180 }}
          />
          <button
            onClick={() => data.onToggleStart(id)}
            style={{ border: "1px solid #d1d5db", borderRadius: 6, background: data.isStart ? "#dbeafe" : "#f9fafb", padding: "2px 6px" }}
            title="開始状態"
          >
            {data.isStart ? "Start ✓" : "Start"}
          </button>
          <button
            onClick={() => data.onToggleAccept(id)}
            style={{ border: "1px solid #d1d5db", borderRadius: 6, background: data.accepting ? "#dcfce7" : "#f9fafb", padding: "2px 6px" }}
            title="受理状態"
          >
            {data.accepting ? "Accept ✓" : "Accept"}
          </button>
        </div>
        <div style={{ color: "#6b7280" }}>（本文は自由メモ。採点は遷移と受理のみ使用）</div>
      </div>

      {/* ハンドル */}
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

const nodeTypes: NodeTypes = { lrDrawState: DrawStateNode };

// ====== 正解グラフの正規化 ======

type Triple = [number, string, number];
type Canon = { n: number; accept: boolean[]; edges: Triple[] };

function canonicalizeExpected(lrItemSets: LRItemSet[]): Canon {
  const states = lrItemSets.map((set) => ({
    accepting: isAcceptingFromItems(set.getLRItems()),
    gotos: (() => {
      const list: Array<{ sym: string; to: number }> = [];
      set.getGotos().forEach((to, sym) => list.push({ sym, to: Number(to) }));
      return list;
    })(),
  }));

  const n = states.length;
  const visited = new Array<boolean>(n).fill(false);
  const mapOldToNew = new Map<number, number>();
  const queue: number[] = [];
  let nextId = 0;

  const push = (old: number) => {
    if (!visited[old]) {
      visited[old] = true;
      mapOldToNew.set(old, nextId++);
      queue.push(old);
    }
  };
  push(0);

  const accept: boolean[] = [];
  const edges: Triple[] = [];

  while (queue.length) {
    const uOld = queue.shift()!;
    const uNew = mapOldToNew.get(uOld)!;
    const st = states[uOld];
    accept[uNew] = st.accepting;

    const outs = [...st.gotos].sort((a, b) => (a.sym < b.sym ? -1 : a.sym > b.sym ? 1 : 0));
    for (const { sym, to } of outs) {
      push(to);
      const vNew = mapOldToNew.get(to)!;
      edges.push([uNew, sym, vNew]);
    }
  }

  return { n: mapOldToNew.size, accept, edges };
}

// ====== 自作グラフの正規化 ======

type CanonUser = {
  canon: Canon;
  unreachableNodeIds: string[];
  problems: string[];
  indexOf: Map<string, number>; // 自作ノードID -> 正規番号
  tripleToEdgeIds: Map<string, string[]>; // "u|label|v"（u,v は正規番号）-> edgeIds
};

function canonicalizeUserGraph(nodes: DrawNode[], edges: DrawEdge[]): CanonUser {
  const idToNode = new Map(nodes.map((n) => [n.id, n]));
  const outMap = new Map<string, Map<string, string>>(); // src -> (label -> dst)
  const problems: string[] = [];
  const tripleToEdgeIds = new Map<string, string[]>();

  for (const e of edges) {
    const label = String(e.label ?? "").trim();
    if (!label) {
      problems.push(`未ラベルのエッジ: ${e.id}`);
      continue;
    }
    if (!idToNode.has(e.source) || !idToNode.has(e.target)) continue;

    let m = outMap.get(e.source);
    if (!m) outMap.set(e.source, (m = new Map()));
    if (m.has(label)) {
      problems.push(`同一状態から同一ラベルに複数遷移: ${e.source} --${label}--> {${m.get(label)} , ${e.target}}`);
    } else {
      m.set(label, e.target);
    }
  }

  // 開始状態
  const start = nodes.find((n) => n.data.isStart)?.id ?? nodes[0]?.id ?? null;

  const indexOf = new Map<string, number>();
  const queue: string[] = [];
  let next = 0;
  const push = (id: string) => {
    if (!indexOf.has(id)) {
      indexOf.set(id, next++);
      queue.push(id);
    }
  };
  if (start) push(start);

  const accept: boolean[] = [];
  const edgesCanon: Triple[] = [];

  while (queue.length) {
    const uId = queue.shift()!;
    const uNew = indexOf.get(uId)!;
    const node = idToNode.get(uId);
    accept[uNew] = !!node?.data.accepting;

    const outs = Array.from(outMap.get(uId)?.entries() ?? []).sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
    for (const [label, vId] of outs) {
      push(vId);
      const vNew = indexOf.get(vId)!;
      edgesCanon.push([uNew, label, vNew]);

      // エッジIDの対応付け
      const ids = edges.filter((ee) => ee.source === uId && ee.target === vId && String(ee.label ?? "").trim() === label).map((ee) => ee.id);
      const key = `${uNew}|${label}|${vNew}`;
      tripleToEdgeIds.set(key, [...(tripleToEdgeIds.get(key) ?? []), ...ids]);
    }
  }

  const reachable = new Set(indexOf.keys());
  const unreachableNodeIds = nodes.map((n) => n.id).filter((id) => !reachable.has(id));

  return { canon: { n: indexOf.size, accept, edges: edgesCanon }, unreachableNodeIds, problems, indexOf, tripleToEdgeIds };
}

// ====== 差分判定 ======

type CheckResult = {
  ok: boolean;
  summary: string[];
  correctEdgeIds: Set<string>;
  wrongEdgeIds: Set<string>;
  wrongAcceptNodeIdx: number[];
  missing: Triple[];
  extra: Triple[];
};

function diffCanon(user: CanonUser, expected: Canon): CheckResult {
  const u = user.canon;
  const e = expected;

  const key = (t: Triple) => `${t[0]}|${t[1]}|${t[2]}`;
  const uSet = new Set(u.edges.map(key));
  const eSet = new Set(e.edges.map(key));

  const missing = e.edges.filter((t) => !uSet.has(key(t)));
  const extra = u.edges.filter((t) => !eSet.has(key(t)));

  const wrongAccept: number[] = [];
  const len = Math.max(u.accept.length, e.accept.length);
  for (let i = 0; i < len; i++) if (!!u.accept[i] !== !!e.accept[i]) wrongAccept.push(i);

  const summary: string[] = [];
  if (u.n !== e.n) summary.push(`状態数が違います: あなた=${u.n}, 正解=${e.n}`);
  if (wrongAccept.length) summary.push(`受理状態が異なる: ${wrongAccept.join(", ")}`);
  if (missing.length) summary.push(`不足遷移: ${missing.map(([a, l, b]) => `(${a})-${l}->(${b})`).join(", ")}`);
  if (extra.length) summary.push(`余計な遷移: ${extra.map(([a, l, b]) => `(${a})-${l}->(${b})`).join(", ")}`);
  if (user.unreachableNodeIds.length) summary.push(`到達不能ノード: ${user.unreachableNodeIds.join(", ")}`);
  if (user.problems.length) summary.push(...user.problems.map((p) => `注意: ${p}`));
  if (!summary.length) summary.push("完全一致。いい仕上がり。");

  // 彩色
  const correctEdgeIds = new Set<string>();
  const wrongEdgeIds = new Set<string>();
  for (const t of u.edges) {
    const k = key(t);
    const ids = user.tripleToEdgeIds.get(k) ?? [];
    if (eSet.has(k)) ids.forEach((id) => correctEdgeIds.add(id));
    else ids.forEach((id) => wrongEdgeIds.add(id));
  }

  const ok = u.n === e.n && !wrongAccept.length && !missing.length && !extra.length && !user.problems.length;
  return { ok, summary, correctEdgeIds, wrongEdgeIds, wrongAcceptNodeIdx: wrongAccept, missing, extra };
}

// ====== メイン ======

type Props = {
  lrItemSets: LRItemSet[]; // 正解
};

const elk = new ELK();

export default function LRDrawAndCheck({ lrItemSets }: Props) {
  // ✨ Node を型引数にする（data ではない）
  const [nodes, setNodes, onNodesChange] = useNodesState<DrawNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<DrawEdge>([]);
  const [layingOut, setLayingOut] = useState(false);
  const [check, setCheck] = useState<ReturnType<typeof diffCanon> | null>(null);

  // 生成ID
  const nid = useRef(0);
  const nextNodeId = () => `U${nid.current++}`;

  // 操作コールバック（引数にも型を付けておく）
  const toggleAccept = useCallback(
    (id: string) => {
      setNodes((nds: DrawNode[]) => nds.map((n) => (n.id === id ? { ...n, data: { ...n.data, accepting: !n.data.accepting } } : n)));
    },
    [setNodes]
  );

  const toggleStart = useCallback(
    (id: string) => {
      setNodes((nds: DrawNode[]) => nds.map((n) => ({ ...n, data: { ...n.data, isStart: n.id === id ? !n.data.isStart : false } })));
    },
    [setNodes]
  );

  const changeTitle = useCallback(
    (id: string, v: string) => {
      setNodes((nds: DrawNode[]) => nds.map((n) => (n.id === id ? { ...n, data: { ...n.data, title: v } } : n)));
    },
    [setNodes]
  );

  const addState = () => {
    const id = nextNodeId();
    setNodes((nds: DrawNode[]) => [
      ...nds,
      {
        id,
        type: "lrDrawState",
        position: { x: 80 + Math.random() * 60, y: 80 + Math.random() * 60 },
        data: {
          title: "I?",
          accepting: false,
          isStart: nds.length === 0,
          onToggleAccept: toggleAccept,
          onToggleStart: toggleStart,
          onTitleChange: changeTitle,
        },
        style: { width: NODE_W, background: "transparent", border: "none", boxShadow: "none" },
        draggable: true,
        selectable: true,
      } satisfies DrawNode,
    ]);
  };

  const onConnect = useCallback(
    (c: Connection) => {
      if (!c.source || !c.target) return;
      const type = c.source === c.target ? "selfLoop" : "editable";
      setEdges((eds: DrawEdge[]) =>
        addEdge(
          {
            ...c,
            id: `e-${c.source}-${c.target}-${Math.random().toString(36).slice(2)}`,
            type,
            label: "",
            markerEnd: type === "editable" ? { type: MarkerType.ArrowClosed } : undefined,
            style: { strokeWidth: 2.2 },
            data: {
              onLabelChange: (id: string, val: string) => setEdges((cur: DrawEdge[]) => cur.map((e) => (e.id === id ? { ...e, label: val } : e))),
            },
          },
          eds
        )
      );
    },
    [setEdges]
  );

  // Auto layout
  const runLayout = async () => {
    setLayingOut(true);
    try {
      const graph = {
        id: "user-graph",
        layoutOptions: {
          "elk.algorithm": "layered",
          "elk.direction": "RIGHT",
          "elk.layered.spacing.nodeNodeBetweenLayers": "60",
          "elk.spacing.nodeNode": "40",
          "elk.layered.nodePlacement.bk.fixedAlignment": "BALANCED",
        },
        children: nodes.map((n) => ({ id: n.id, width: NODE_W, height: NODE_H })),
        edges: edges.map((e) => ({ id: e.id, sources: [e.source], targets: [e.target] })),
      } as const;

      const res = await elk.layout(graph);
      const nextNodes = nodes.map((n) => {
        const g = res.children?.find((c) => c.id === n.id);
        return g ? { ...n, position: { x: g.x ?? 0, y: g.y ?? 0 } } : n;
      });
      setNodes(nextNodes);
    } catch (e) {
      console.error(e);
    } finally {
      setLayingOut(false);
    }
  };

  // 採点
  const doCheck = () => {
    const expected = canonicalizeExpected(lrItemSets);
    const user = canonicalizeUserGraph(nodes, edges);
    const res = diffCanon(user, expected);
    setCheck(res);
  };

  // エッジ彩色（合ってる=緑、間違い=赤）
  const vizEdges = useMemo<DrawEdge[]>(() => {
    if (!check) return edges;
    return edges.map((e) => {
      const right = check.correctEdgeIds.has(e.id);
      const wrong = check.wrongEdgeIds.has(e.id);
      return {
        ...e,
        style: {
          ...(e.style ?? {}),
          stroke: right ? "#10b981" : wrong ? "#ef4444" : (e.style as any)?.stroke,
          strokeWidth: right || wrong ? 3 : (e.style as any)?.strokeWidth ?? 2.2,
        },
      };
    });
  }, [edges, check]);

  const deleteSelected = () => {
    setNodes((nds: DrawNode[]) => nds.filter((n) => !n.selected));
    setEdges((eds: DrawEdge[]) => eds.filter((e) => !e.selected));
  };

  const seedFromAnswer = () => {
    const seeded: DrawNode[] = [];
    for (let i = 0; i < lrItemSets.length; i++) {
      const accepting = isAcceptingFromItems(lrItemSets[i].getLRItems());
      const id = nextNodeId();
      seeded.push({
        id,
        type: "lrDrawState",
        position: { x: 60 + i * (NODE_W + 40), y: 80 },
        data: {
          title: `I${i}`,
          accepting,
          isStart: i === 0,
          onToggleAccept: toggleAccept,
          onToggleStart: toggleStart,
          onTitleChange: changeTitle,
        },
        style: { width: NODE_W, background: "transparent", border: "none", boxShadow: "none" },
        draggable: true,
        selectable: true,
      });
    }
    setNodes(seeded);
    setEdges([]);
    setCheck(null);
  };

  return (
    <div style={{ width: "100%", height: "80vh", position: "relative" }}>
      <ReactFlowProvider>
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
            gap: 10,
            alignItems: "center",
          }}
        >
          <strong>LRオートマトン（手で描く）</strong>
          <button onClick={addState} style={{ padding: "4px 8px", border: "1px solid #d1d5db", borderRadius: 6, background: "#f9fafb" }}>
            + 状態
          </button>
          <button onClick={deleteSelected} style={{ padding: "4px 8px", border: "1px solid #d1d5db", borderRadius: 6, background: "#fff1f2" }}>
            選択を削除
          </button>
          <button onClick={runLayout} style={{ padding: "4px 8px", border: "1px solid #d1d5db", borderRadius: 6, background: "#f9fafb" }}>
            {layingOut ? "整列中…" : "Auto layout"}
          </button>
          <button onClick={doCheck} style={{ padding: "4px 8px", border: "1px solid #d1d5db", borderRadius: 6, background: "#ecfeff" }}>
            Check
          </button>
          <button onClick={seedFromAnswer} style={{ padding: "4px 8px", border: "1px solid #d1d5db", borderRadius: 6, background: "#f3f4f6" }}>
            I0..だけ並べる
          </button>
          <span style={{ color: "#6b7280" }}>エッジはダブルクリックでラベル編集</span>
        </div>

        <div
          style={{
            position: "absolute",
            zIndex: 10,
            top: 8,
            right: 8,
            background: "white",
            border: "1px solid #e5e7eb",
            padding: "8px 10px",
            borderRadius: 8,
            fontSize: 12,
            maxWidth: 520,
            minWidth: 300,
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: 6 }}>結果</div>
          {check ? (
            <ul style={{ margin: 0, paddingLeft: 16 }}>
              {check.summary.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          ) : (
            <div style={{ color: "#6b7280" }}>「Check」で採点します。</div>
          )}
        </div>

        <ReactFlow<DrawNode, DrawEdge>
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          nodes={nodes}
          edges={vizEdges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          proOptions={{ hideAttribution: true }}
          snapToGrid
          snapGrid={[10, 10]}
        >
          <MiniMap pannable zoomable maskColor="rgba(0,0,0,0.08)" />
          <Controls />
          <Background />
        </ReactFlow>
      </ReactFlowProvider>
    </div>
  );
}
