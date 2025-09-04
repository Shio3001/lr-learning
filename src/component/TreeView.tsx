import { useMemo, type CSSProperties } from "react";
import { ParseTreeNode } from "../compiler/interface/tree";

// === プロップス ===
export type ParseTreeViewerProps = {
  root: ParseTreeNode;
  /** ラッパーの幅（既定: '100%'） */
  width?: number | string;
  /** ラッパーの高さ（既定: 560） */
  height?: number | string;
  /** ラッパーの追加スタイル（任意） */
  containerStyle?: CSSProperties;
  /** ノード矩形の追加スタイル（任意） */
  nodeBoxStyle?: CSSProperties;
  /** テキストの追加スタイル（任意） */
  textStyle?: CSSProperties;
  /** ノードの高さ（px） */
  nodeHeight?: number;
  /** 親子の縦間隔（px） */
  vGap?: number;
  /** 兄弟の横間隔（px） */
  hGap?: number;
};

// === レイアウト用 ===
type LayoutNode = {
  symbol: string;
  depth: number;
  x: number; // 中心X（絶対座標）
  y: number; // 上端Y（絶対座標）
  w: number;
  h: number;
  children: LayoutNode[];
};

function measureNodeWidth(symbol: string): number {
  const min = 60;
  const max = 240;
  const approx = 24 + symbol.length * 9; // ざっくり
  return Math.max(min, Math.min(max, approx));
}

function buildRelativeLayout(node: ParseTreeNode, depth: number, nodeH: number, vGap: number, hGap: number): LayoutNode & { subtreeWidth: number } {
  const w = measureNodeWidth(node.symbol);
  const h = nodeH;

  const children = node.children.map((c) => buildRelativeLayout(c, depth + 1, nodeH, vGap, hGap));

  let subtreeWidth: number;
  if (children.length === 0) {
    subtreeWidth = w;
  } else {
    const sumChildren = children.reduce((acc, c) => acc + c.subtreeWidth, 0);
    subtreeWidth = Math.max(w, sumChildren + hGap * (children.length - 1));
  }

  let cursor = -(subtreeWidth / 2);
  for (const c of children) {
    (c as any).x = cursor + c.subtreeWidth / 2; // 相対X
    cursor += c.subtreeWidth + hGap;
  }

  return {
    symbol: node.symbol,
    depth,
    x: 0, // 相対（親中心）
    y: depth * (h + vGap),
    w,
    h,
    children: children as unknown as LayoutNode[],
    subtreeWidth,
  };
}

function absolutize(node: LayoutNode, parentCenterX = 0): void {
  node.x = node.x + parentCenterX;
  for (const c of node.children) absolutize(c, node.x);
}

function collectNodes(node: LayoutNode, acc: LayoutNode[] = []): LayoutNode[] {
  acc.push(node);
  for (const c of node.children) collectNodes(c, acc);
  return acc;
}

function collectEdges(node: LayoutNode, acc: { from: LayoutNode; to: LayoutNode }[] = []) {
  for (const c of node.children) {
    acc.push({ from: node, to: c });
    collectEdges(c, acc);
  }
  return acc;
}

export default function ParseTreeViewer({
  root,
  width = "100%",
  height = 560,
  containerStyle,
  nodeBoxStyle,
  textStyle,
  nodeHeight = 36,
  vGap = 64,
  hGap = 28,
}: ParseTreeViewerProps) {
  const { nodes, edges } = useMemo(() => {
    const rel = buildRelativeLayout(root, 0, nodeHeight, vGap, hGap);
    absolutize(rel, 0);
    const ns = collectNodes(rel);
    const es = collectEdges(rel);
    return { nodes: ns, edges: es };
  }, [root, nodeHeight, vGap, hGap]);

  const bounds = useMemo(() => {
    const pad = 24;
    const minX = Math.min(...nodes.map((n) => n.x - n.w / 2));
    const maxX = Math.max(...nodes.map((n) => n.x + n.w / 2));
    const minY = Math.min(...nodes.map((n) => n.y));
    const maxY = Math.max(...nodes.map((n) => n.y + n.h));
    return { minX: minX - pad, maxX: maxX + pad, minY: Math.max(0, minY - pad), maxY: maxY + pad };
  }, [nodes]);

  const viewWidth = Math.max(1, bounds.maxX - bounds.minX);
  const viewHeight = Math.max(1, bounds.maxY - bounds.minY);

  const wrapperStyle: CSSProperties = {
    width,
    height,
    background: "#ffffff",
    border: "1px solid #d0d7de",
    borderRadius: 12,
    overflow: "hidden",
    ...containerStyle,
  };

  return (
    <div style={wrapperStyle}>
      <svg width="100%" height="100%" viewBox={`${bounds.minX} ${bounds.minY} ${viewWidth} ${viewHeight}`} role="img" aria-label="Parse tree">
        {/* edges */}
        {edges.map((e, i) => {
          const sx = e.from.x;
          const sy = e.from.y + e.from.h;
          const tx = e.to.x;
          const ty = e.to.y;
          const midY = (sy + ty) / 2;
          const d = `M ${sx} ${sy} C ${sx} ${midY}, ${tx} ${midY}, ${tx} ${ty}`;
          return <path key={i} d={d} stroke="#9aa1a9" strokeWidth={1.2} fill="none" />;
        })}

        {/* nodes */}
        {nodes.map((n, i) => (
          <g key={i} transform={`translate(${n.x - n.w / 2}, ${n.y})`}>
            <rect width={n.w} height={n.h} rx={8} ry={8} fill="#ffffff" stroke="#6b7280" strokeWidth={1.2} style={nodeBoxStyle} />
            <text
              x={n.w / 2}
              y={n.h / 2 + 4}
              textAnchor="middle"
              fontFamily="system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'Noto Sans JP', sans-serif"
              fontSize={14}
              fill="#111827"
              style={textStyle}
            >
              {n.symbol}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}
