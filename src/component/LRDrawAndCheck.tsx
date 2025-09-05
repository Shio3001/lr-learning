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

import type { LRItemSet } from "../compiler/interface/lr0ItemSet";
import type { LRItem } from "../compiler/interface/lrItem";
import type { BNFElement } from "../compiler/interface/bnf";

// ====== 型定義 ======
type DrawNodeData = {
  title: string;
  accepting: boolean;
  isStart: boolean;
  items: UserItem[]; // ノード内の LR アイテム（順不同）
  onToggleAccept: (id: string) => void;
  onToggleStart: (id: string) => void;
  onTitleChange: (id: string, v: string) => void;
  onItemsChange: (id: string, items: UserItem[]) => void;
};

type DrawNode = RFNode<DrawNodeData>;
type DrawEdge = RFEdge;

// Grammar（BNFSet）: 生成規則（ドットなしの「素の」右辺列）を集約
type SimpleElem = { type: "terminal" | "nonterminal"; value: string };
type Production = { id: string; left: string; elements: SimpleElem[] };

// ユーザーが持つ LR アイテム（UI用）。LRItem 互換で比較可能にする
type UserItem = {
  left: string;
  elements: SimpleElem[];
  dot: number; // 0..elements.length
};

// ====== ユーティリティ ======

// cubic Bézier の点を t で求める
const bz = (t: number, p0: number, p1: number, p2: number, p3: number) => {
  const u = 1 - t;
  return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3;
};

// BNFElement -> SimpleElem
function readElem(e: any): SimpleElem {
  const type = typeof e?.getType === "function" ? e.getType() : e?.type;
  const value = typeof e?.getValue === "function" ? e.getValue() : e?.value;
  return { type, value };
}

// LRItem -> UserItem
function snapFromLRItem(item: LRItem): UserItem {
  const c = item.getConcatenation();
  const left = c.getLeft();
  const elements = (c.getElements() as any[]).map(readElem);
  const dot = item.getDotPosition();
  return { left, elements, dot };
}

// UserItem -> 表示用テキスト（• を挿入）
function fmtUserItem(it: UserItem): string {
  const parts: string[] = [];
  for (let i = 0; i <= it.elements.length; i++) {
    if (i === it.dot) parts.push("•");
    if (i < it.elements.length) {
      const e = it.elements[i];
      parts.push(e.type === "terminal" ? `'${e.value}'` : e.value);
    }
  }
  return `${it.left} → ${parts.join(" ")}`;
}

// アイテム同値性（順不同判定用にキー化）
function keyUserItem(it: UserItem): string {
  const rhs = it.elements.map((e) => (e.type === "terminal" ? `t:${e.value}` : `n:${e.value}`)).join(" ");
  return `${it.left}::${rhs}::dot=${it.dot}`;
}

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
            pointerEvents: "all",
          }}
          onDoubleClick={(e) => {
            e.stopPropagation();
            setEditing(true);
          }}
          onMouseDown={(e) => e.stopPropagation()}
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
              onMouseDown={(e) => e.stopPropagation()}
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

// ====== カスタム・ノード（アイテム編集UI付き） ======

const NODE_W = 300;
const NODE_H = 220;
const HANDLE_OUT = 18;

function DrawStateNode({ id, data }: NodeProps<DrawNode>) {
  const moveDot = (idx: number, dir: -1 | 1) => {
    const it = data.items[idx];
    const next = Math.max(0, Math.min(it.elements.length, it.dot + dir));
    if (next === it.dot) return;
    const items = data.items.map((x, i) => (i === idx ? { ...x, dot: next } : x));
    data.onItemsChange(id, items);
  };
  const removeItem = (idx: number) => {
    const items = data.items.filter((_, i) => i !== idx);
    data.onItemsChange(id, items);
  };

  return (
    <div style={{ width: NODE_W, background: "transparent", border: "none" }}>
      <div
        style={{
          padding: 8,
          borderRadius: 10,
          border: data.accepting ? "2px solid #10b981" : "1px solid #e5e7eb",
          background: "white",
          width: NODE_W,
          maxHeight: NODE_H,
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
            style={{ fontWeight: 700, border: "1px solid #e5e7eb", borderRadius: 6, padding: "2px 6px", width: 150 }}
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

        {data.items.length ? (
          <ul style={{ margin: 0, paddingLeft: 16, display: "grid", gap: 4 }}>
            {data.items.map((it, idx) => (
              <li key={idx} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ flex: 1 }}>{fmtUserItem(it)}</span>
                <div style={{ display: "flex", gap: 4 }}>
                  <button title="dot ←" onClick={() => moveDot(idx, -1)} style={{ border: "1px solid #ddd", borderRadius: 4, padding: "0 6px" }}>
                    ←
                  </button>
                  <button title="dot →" onClick={() => moveDot(idx, +1)} style={{ border: "1px solid #ddd", borderRadius: 4, padding: "0 6px" }}>
                    →
                  </button>
                  <button title="削除" onClick={() => removeItem(idx)} style={{ border: "1px solid #fca5a5", borderRadius: 4, padding: "0 6px" }}>
                    ×
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div style={{ color: "#6b7280" }}>（アイテム未追加）</div>
        )}
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

// ====== 正解グラフの正規化（状態 & 遷移 & アイテム集合） ======

type Triple = [number, string, number];
type CanonState = { items: UserItem[]; accepting: boolean };
type Canon = { n: number; accept: boolean[]; edges: Triple[]; states: CanonState[] };

function canonicalizeExpected(lrItemSets: LRItemSet[]): Canon {
  // I0 からラベル順 BFS で再番号
  const statesRaw = lrItemSets.map((set) => ({
    accepting: isAcceptingFromItems(set.getLRItems()),
    gotos: (() => {
      const list: Array<{ sym: string; to: number }> = [];
      set.getGotos().forEach((to, sym) => list.push({ sym, to: Number(to) }));
      return list;
    })(),
    items: set.getLRItems().map(snapFromLRItem),
  }));

  const n = statesRaw.length;
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
  const states: CanonState[] = [];

  while (queue.length) {
    const uOld = queue.shift()!;
    const uNew = mapOldToNew.get(uOld)!;
    const st = statesRaw[uOld];
    accept[uNew] = st.accepting;
    states[uNew] = { accepting: st.accepting, items: st.items.slice() }; // items は順不同で後で比較

    const outs = [...st.gotos].sort((a, b) => (a.sym < b.sym ? -1 : a.sym > b.sym ? 1 : 0));
    for (const { sym, to } of outs) {
      push(to);
      const vNew = mapOldToNew.get(to)!;
      edges.push([uNew, sym, vNew]);
    }
  }

  return { n: mapOldToNew.size, accept, edges, states };
}

// ====== 自作グラフの正規化（状態 & 遷移 & アイテム集合） ======

type CanonUser = {
  canon: Canon;
  unreachableNodeIds: string[];
  problems: string[];
  indexOf: Map<string, number>; // 自作ノードID -> 正規番号
  tripleToEdgeIds: Map<string, string[]>; // "u|label|v" -> edgeIds
  nodeIdOfIdx: Map<number, string>;
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
  const nodeIdOfIdx = new Map<number, string>();
  const queue: string[] = [];
  let next = 0;
  const push = (id: string) => {
    if (!indexOf.has(id)) {
      indexOf.set(id, next);
      nodeIdOfIdx.set(next, id);
      next++;
      queue.push(id);
    }
  };
  if (start) push(start);

  const accept: boolean[] = [];
  const edgesCanon: Triple[] = [];
  const states: CanonState[] = [];

  while (queue.length) {
    const uId = queue.shift()!;
    const uNew = indexOf.get(uId)!;
    const node = idToNode.get(uId)!;
    accept[uNew] = !!node?.data.accepting;
    states[uNew] = { accepting: !!node?.data.accepting, items: node?.data.items ?? [] };

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

  return {
    canon: { n: indexOf.size, accept, edges: edgesCanon, states },
    unreachableNodeIds,
    problems,
    indexOf,
    tripleToEdgeIds,
    nodeIdOfIdx,
  };
}

// ====== 差分判定（遷移 + 受理 + ノード内アイテム順不同） ======

type NodeItemDiff = { idx: number; missing: UserItem[]; extra: UserItem[] };

type CheckResult = {
  ok: boolean;
  summary: string[];
  correctEdgeIds: Set<string>;
  wrongEdgeIds: Set<string>;
  wrongAcceptNodeIdx: number[];
  nodeItemDiffs: NodeItemDiff[];
  wrongItemNodeIds: Set<string>;
};

function diffCanon(user: CanonUser, expected: Canon): CheckResult {
  const u = user.canon;
  const e = expected;

  // 1) 遷移差分
  const keyTriple = (t: Triple) => `${t[0]}|${t[1]}|${t[2]}`;
  const uSet = new Set(u.edges.map(keyTriple));
  const eSet = new Set(e.edges.map(keyTriple));

  const missing = e.edges.filter((t) => !uSet.has(keyTriple(t)));
  const extra = u.edges.filter((t) => !eSet.has(keyTriple(t)));

  // 2) 受理差分
  const wrongAccept: number[] = [];
  const lenA = Math.max(u.accept.length, e.accept.length);
  for (let i = 0; i < lenA; i++) if (!!u.accept[i] !== !!e.accept[i]) wrongAccept.push(i);

  // 3) ノード内 LR アイテム差分（順不同）
  const nodeItemDiffs: NodeItemDiff[] = [];
  const wrongItemNodeIds = new Set<string>();
  const lenS = Math.max(u.states.length, e.states.length);
  for (let i = 0; i < lenS; i++) {
    const uItems = u.states[i]?.items ?? [];
    const eItems = e.states[i]?.items ?? [];

    const uMap = new Map<string, number>();
    const eMap = new Map<string, number>();
    for (const it of uItems) uMap.set(keyUserItem(it), (uMap.get(keyUserItem(it)) ?? 0) + 1);
    for (const it of eItems) eMap.set(keyUserItem(it), (eMap.get(keyUserItem(it)) ?? 0) + 1);

    const missingItems: UserItem[] = [];
    const extraItems: UserItem[] = [];

    // expected の方から不足を拾う
    for (const [k, need] of eMap) {
      const have = uMap.get(k) ?? 0;
      for (let c = 0; c < Math.max(0, need - have); c++) {
        // キーから復元（簡易に e 側の代表を拾う）
        const sample = eItems.find((x) => keyUserItem(x) === k)!;
        missingItems.push(sample);
      }
    }
    // user の方の余計を拾う
    for (const [k, have] of uMap) {
      const need = eMap.get(k) ?? 0;
      for (let c = 0; c < Math.max(0, have - need); c++) {
        const sample = uItems.find((x) => keyUserItem(x) === k)!;
        extraItems.push(sample);
      }
    }

    if (missingItems.length || extraItems.length) {
      nodeItemDiffs.push({ idx: i, missing: missingItems, extra: extraItems });
      const nid = user.nodeIdOfIdx.get(i);
      if (nid) wrongItemNodeIds.add(nid);
    }
  }

  // サマリー
  const summary: string[] = [];
  if (u.n !== e.n) summary.push(`状態数が違います: あなた=${u.n}, 正解=${e.n}`);
  if (wrongAccept.length) summary.push(`受理状態が異なる: ${wrongAccept.join(", ")}`);
  if (missing.length) summary.push(`不足遷移: ${missing.map(([a, l, b]) => `(${a})-${l}->(${b})`).join(", ")}`);
  if (extra.length) summary.push(`余計な遷移: ${extra.map(([a, l, b]) => `(${a})-${l}->(${b})`).join(", ")}`);
  for (const d of nodeItemDiffs) {
    const miss = d.missing.map(fmtUserItem).join(" | ");
    const extr = d.extra.map(fmtUserItem).join(" | ");
    if (miss) summary.push(`状態 ${d.idx}: 不足アイテム → ${miss}`);
    if (extr) summary.push(`状態 ${d.idx}: 余計なアイテム → ${extr}`);
  }
  if (user.unreachableNodeIds.length) summary.push(`到達不能ノード: ${user.unreachableNodeIds.join(", ")}`);
  if (user.problems.length) summary.push(...user.problems.map((p) => `注意: ${p}`));
  if (!summary.length) summary.push("完全一致。いい仕上がり。");

  // エッジ彩色用
  const correctEdgeIds = new Set<string>();
  const wrongEdgeIds = new Set<string>();
  for (const t of u.edges) {
    const k = keyTriple(t);
    const ids = user.tripleToEdgeIds.get(k) ?? [];
    if (eSet.has(k)) ids.forEach((id) => correctEdgeIds.add(id));
    else ids.forEach((id) => wrongEdgeIds.add(id));
  }

  const ok =
    u.n === e.n &&
    !wrongAccept.length &&
    !missing.length &&
    !extra.length &&
    !user.problems.length &&
    nodeItemDiffs.every((d) => d.missing.length === 0 && d.extra.length === 0);

  return { ok, summary, correctEdgeIds, wrongEdgeIds, wrongAcceptNodeIdx: wrongAccept, nodeItemDiffs, wrongItemNodeIds };
}

// ====== メイン ======

type Props = {
  lrItemSets: LRItemSet[]; // 正解
  grammar?: Production[]; // BNFSet（省略時は lrItemSets から抽出）
};

const elk = new ELK();

export default function LRDrawAndCheck({ lrItemSets, grammar }: Props) {
  // ノード/エッジ
  const [nodes, setNodes, onNodesChange] = useNodesState<DrawNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<DrawEdge>([]);
  const [layingOut, setLayingOut] = useState(false);
  const [check, setCheck] = useState<ReturnType<typeof diffCanon> | null>(null);

  // Grammar 準備（左辺で絞り込める）
  const derivedGrammar: Production[] = useMemo(() => {
    if (grammar && grammar.length) return grammar;
    // lrItemSets から「左辺＋右辺列（ドット無視）」のユニーク集合を抽出
    const seen = new Set<string>();
    const list: Production[] = [];
    lrItemSets.forEach((set, si) => {
      set.getLRItems().forEach((it, ii) => {
        const c = it.getConcatenation();
        const left = c.getLeft();
        const elements = (c.getElements() as any[]).map(readElem);
        const rhsKey = elements.map((e) => (e.type === "terminal" ? `t:${e.value}` : `n:${e.value}`)).join(" ");
        const key = `${left}::${rhsKey}`;
        if (!seen.has(key)) {
          seen.add(key);
          list.push({ id: key, left, elements });
        }
      });
    });
    return list;
  }, [grammar, lrItemSets]);

  const nonterminals = useMemo(() => Array.from(new Set(derivedGrammar.map((p) => p.left))).sort(), [derivedGrammar]);

  // Grammar UI 状態
  const [selLeft, setSelLeft] = useState<string>(nonterminals[0] ?? "");
  useEffect(() => {
    if (!nonterminals.includes(selLeft)) setSelLeft(nonterminals[0] ?? "");
  }, [nonterminals]); // selLeft を非存在なら先頭に

  const prodsForLeft = useMemo(() => derivedGrammar.filter((p) => p.left === selLeft), [derivedGrammar, selLeft]);
  const [selProdId, setSelProdId] = useState<string>(prodsForLeft[0]?.id ?? "");
  useEffect(() => {
    setSelProdId(prodsForLeft[0]?.id ?? "");
  }, [prodsForLeft]);

  const selProd = useMemo(() => prodsForLeft.find((p) => p.id === selProdId) ?? null, [prodsForLeft, selProdId]);

  const [dotPos, setDotPos] = useState<number>(0);
  useEffect(() => {
    setDotPos(0);
  }, [selProdId]);

  // 生成ID
  const nid = useRef(0);
  const nextNodeId = () => `U${nid.current++}`;

  // 便利: 現在の選択ノード
  const selectedNodeId = useMemo(() => nodes.find((n) => n.selected)?.id ?? null, [nodes]);

  // 操作コールバック
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

  const changeItems = useCallback(
    (id: string, items: UserItem[]) => {
      setNodes((nds: DrawNode[]) => nds.map((n) => (n.id === id ? { ...n, data: { ...n.data, items } } : n)));
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
        position: { x: 80 + Math.random() * 60, y: 120 + Math.random() * 60 },
        data: {
          title: "I?",
          accepting: false,
          isStart: nds.length === 0,
          items: [],
          onToggleAccept: toggleAccept,
          onToggleStart: toggleStart,
          onTitleChange: changeTitle,
          onItemsChange: changeItems,
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

  // Grammar → 選択ノードへ追加
  const addItemToSelectedNode = () => {
    if (!selProd) return;
    const targetId = selectedNodeId ?? nodes[0]?.id ?? null;
    if (!targetId) return; // ノードがないなら何もしない（まず追加してね）

    const item: UserItem = { left: selProd.left, elements: selProd.elements, dot: Math.max(0, Math.min(selProd.elements.length, dotPos)) };
    setNodes((nds: DrawNode[]) => nds.map((n) => (n.id === targetId ? { ...n, data: { ...n.data, items: [...n.data.items, item] } } : n)));
  };

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

  // 可視化：エッジ色
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

  // 可視化：ノード枠（アイテム一致/不一致で色分け）
  const vizNodes = useMemo<DrawNode[]>(() => {
    if (!check) return nodes;
    const redIds = check.wrongItemNodeIds;
    const wrongAcceptIdx = new Set(check.wrongAcceptNodeIdx);
    // user の正規番号 -> nodeId
    const userCanon = canonicalizeUserGraph(nodes, edges); // 軽いので再利用
    const idxToId = userCanon.nodeIdOfIdx;

    const wrongAcceptIds = new Set<string>();
    wrongAcceptIdx.forEach((i) => {
      const nid = idxToId.get(i);
      if (nid) wrongAcceptIds.add(nid);
    });

    return nodes.map((n) => {
      const wrongItem = redIds.has(n.id);
      const wrongAcc = wrongAcceptIds.has(n.id);
      const border = wrongItem || wrongAcc ? "2px solid #ef4444" : "1px solid #e5e7eb";
      // accepting なら元の緑に重ねたいが、採点結果優先で赤/緑の二択にする
      const bgBorder = wrongItem || wrongAcc ? border : n.data.accepting ? "2px solid #10b981" : "1px solid #e5e7eb";
      return {
        ...n,
        style: { ...(n.style ?? {}), width: NODE_W, background: "transparent", border: "none", boxShadow: "none" },
        data: { ...n.data }, // data は変更なし
        // 枠色はノード内のカードで表現しているので、カード側へ色指定を渡す？→簡易に data.accepting をそのまま使う。
      };
    });
  }, [nodes, edges, check]);

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
        position: { x: 60 + i * (NODE_W + 40), y: 100 },
        data: {
          title: `I${i}`,
          accepting,
          isStart: i === 0,
          items: [], // 中身はユーザーが入れる
          onToggleAccept: toggleAccept,
          onToggleStart: toggleStart,
          onTitleChange: changeTitle,
          onItemsChange: changeItems,
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

  // Grammar ドット UI：選択規則の RHS を表示し、隙間クリックで dotPos を移動
  const DotChooser = () => {
    if (!selProd) return null;
    const gaps = selProd.elements.length + 1;
    return (
      <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 6 }}>
        <span style={{ fontWeight: 700 }}>{selProd.left} →</span>
        {Array.from({ length: gaps }).map((_, i) => (
          <span key={`gap-${i}`} style={{ display: "contents" }}>
            {i === dotPos && <span style={{ color: "#10b981", fontWeight: 700 }}>•</span>}
            {i < selProd.elements.length && (
              <button
                onClick={() => setDotPos(i + 1)}
                style={{
                  border: "1px solid #e5e7eb",
                  borderRadius: 6,
                  padding: "2px 6px",
                  background: "#fff",
                  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                }}
              >
                {selProd.elements[i].type === "terminal" ? `'${selProd.elements[i].value}'` : selProd.elements[i].value}
              </button>
            )}
            {i < selProd.elements.length ? <span style={{ width: 4, display: "inline-block" }} /> : null}
          </span>
        ))}
        {/* dot を先頭に移す操作 */}
        <div style={{ display: "flex", gap: 6, marginLeft: 8 }}>
          <button onClick={() => setDotPos(Math.max(0, dotPos - 1))} style={{ border: "1px solid #ddd", borderRadius: 6, padding: "2px 6px" }}>
            ←
          </button>
          <button
            onClick={() => setDotPos(Math.min(selProd.elements.length, dotPos + 1))}
            style={{ border: "1px solid #ddd", borderRadius: 6, padding: "2px 6px" }}
          >
            →
          </button>
        </div>
      </div>
    );
  };

  return (
    <div style={{ width: "100%", height: "82vh", position: "relative" }}>
      <ReactFlowProvider>
        {/* 左ペイン：Grammar パレット */}
        <div
          style={{
            position: "absolute",
            zIndex: 10,
            top: 8,
            left: 8,
            background: "white",
            border: "1px solid #e5e7eb",
            padding: "10px 12px",
            borderRadius: 10,
            fontSize: 12,
            width: 420,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <strong>Grammar（BNFSet）</strong>
            <button onClick={addState} style={{ marginLeft: "auto", padding: "4px 8px", border: "1px solid #d1d5db", borderRadius: 6, background: "#f9fafb" }}>
              + 状態
            </button>
            <button onClick={deleteSelected} style={{ padding: "4px 8px", border: "1px solid #d1d5db", borderRadius: 6, background: "#fff1f2" }}>
              選択削除
            </button>
            <button onClick={seedFromAnswer} style={{ padding: "4px 8px", border: "1px solid #d1d5db", borderRadius: 6, background: "#f3f4f6" }}>
              I0..だけ並べる
            </button>
          </div>

          {nonterminals.length ? (
            <>
              <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
                <label>左辺</label>
                <select value={selLeft} onChange={(e) => setSelLeft(e.currentTarget.value)} style={{ padding: 4 }}>
                  {nonterminals.map((nt) => (
                    <option key={nt} value={nt}>
                      {nt}
                    </option>
                  ))}
                </select>
                <label>生成規則</label>
                <select value={selProdId} onChange={(e) => setSelProdId(e.currentTarget.value)} style={{ padding: 4, width: 220 }}>
                  {prodsForLeft.map((p) => {
                    const rhs = p.elements.map((e) => (e.type === "terminal" ? `'${e.value}'` : e.value)).join(" ");
                    return (
                      <option key={p.id} value={p.id}>
                        {p.left} → {rhs}
                      </option>
                    );
                  })}
                </select>
              </div>

              <div style={{ marginBottom: 8 }}>
                <div style={{ marginBottom: 6, color: "#374151" }}>dot 位置を矢印キーで選択 / もしくは要素をクリックで挿入</div>
                <DotChooser />
              </div>

              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={addItemToSelectedNode} style={{ padding: "4px 8px", border: "1px solid #d1d5db", borderRadius: 6, background: "#ecfeff" }}>
                  選択ノードへ追加
                </button>
                <button onClick={runLayout} style={{ padding: "4px 8px", border: "1px solid #d1d5db", borderRadius: 6, background: "#f9fafb" }}>
                  {layingOut ? "整列中…" : "Auto layout"}
                </button>
                <button onClick={doCheck} style={{ padding: "4px 8px", border: "1px solid #d1d5db", borderRadius: 6, background: "#d1fae5" }}>
                  Check
                </button>
              </div>

              <div style={{ marginTop: 6, color: "#6b7280" }}>まず状態を選択（クリック）→ 生成規則を選んで • を置き → 「選択ノードへ追加」。</div>
            </>
          ) : (
            <div style={{ color: "#6b7280" }}>Grammar が見つかりません（lrItemSets から抽出できませんでした）。</div>
          )}
        </div>

        {/* 右ペイン：採点結果 */}
        <div
          style={{
            position: "absolute",
            zIndex: 10,
            top: 8,
            right: 8,
            background: "white",
            border: "1px solid #e5e7eb",
            padding: "8px 10px",
            borderRadius: 10,
            fontSize: 12,
            width: 520,
            maxHeight: "76vh",
            overflow: "auto",
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: 6 }}>結果</div>
          {check ? (
            <ul style={{ margin: 0, paddingLeft: 16 }}>
              {check.summary.map((s, i) => (
                <li key={i} style={{ marginBottom: 4 }}>
                  {s}
                </li>
              ))}
            </ul>
          ) : (
            <div style={{ color: "#6b7280" }}>「Check」で採点します（遷移・受理・ノード内LRアイテム順不同）。</div>
          )}
        </div>

        <ReactFlow<DrawNode, DrawEdge>
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          nodes={vizNodes}
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
