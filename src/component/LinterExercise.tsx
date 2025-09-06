// LinterExercise.tsx
import React, { useMemo, useState } from "react";
import type { ParseTreeNode } from "../compiler/interface/tree";
import TextInput from "../atoms/PredictionText"; // あなたのパスに合わせて

/** ─────────────────────────────────────────────────────
 * 診断・ルールの基本型
 *  severity … 表示上の重要度
 *  path     … ルートから対象ノードまでのインデックス配列
 * ──────────────────────────────────────────────────── */
type Severity = "error" | "warning" | "info";

export type Diagnostic = {
  ruleId: string;
  message: string;
  severity: Severity;
  path: number[];
};

export type RuleContext = {
  node: ParseTreeNode;
  ancestors: ParseTreeNode[];
  path: number[];
};

/** ルール:
 *  - kind: ルールの種類（パターン一致 or 関数）
 *  - trigger: 診断を「一致時に出す」か「不一致時に出す」か
 */
export type Rule = {
  id: string;
  description: string;
  severity?: Severity;
  check: (ctx: RuleContext) => Diagnostic[] | void;
  enabled?: boolean;
  kind?: "pattern-exact" | "pattern-prefix" | "function";
  trigger?: "onMatch" | "onMismatch";
};

/** ─────────────────────────────────────────────────────
 * 木の走査ユーティリティ
 * ──────────────────────────────────────────────────── */
function walk(node: ParseTreeNode, cb: (ctx: RuleContext) => void, ancestors: ParseTreeNode[] = [], path: number[] = []) {
  cb({ node, ancestors, path });
  node.children?.forEach((ch, i) => walk(ch, cb, [...ancestors, node], [...path, i]));
}

/** 表示用：パス→「A → B → C」 */
function pathToString(root: ParseTreeNode, path: number[]): string {
  const labels: string[] = [];
  let cur: ParseTreeNode | undefined = root;
  labels.push(cur.symbol);
  for (const idx of path) {
    cur = cur?.children?.[idx];
    if (!cur) break;
    labels.push(cur.symbol);
  }
  return labels.join(" → ");
}

/** ユーティリティ：パスでノード取得 */
function findNodeByPath(root: ParseTreeNode, path: number[]): ParseTreeNode | null {
  let cur: ParseTreeNode = root;
  for (const i of path) {
    if (!cur.children || i < 0 || i >= cur.children.length) return null;
    cur = cur.children[i];
  }
  return cur;
}

/** ─────────────────────────────────────────────────────
 * 宣言的パターン指定
 *  - trigger: "onMismatch" なら「期待に合わないとき」報告（デフォルト）
 *             "onMatch"    なら「期待に合ったとき」報告（禁則検知などに便利）
 *  - effectiveInversion: 互換用（true=onMatch/false=onMismatch）
 * ──────────────────────────────────────────────────── */
type PatternSpecBase = {
  id: string;
  parent: string;
  message?: string;
  severity?: Severity;
  enabled?: boolean;
  trigger?: "onMatch" | "onMismatch";
  /** @deprecated 旧オプション（true:一致時に報告/false:不一致時に報告） */
  effectiveInversion?: boolean;
};
type PatternSpecExact = PatternSpecBase & { exactChildren: string[] };
type PatternSpecPrefix = PatternSpecBase & { childrenStartsWith: string[] };
type PatternSpec = PatternSpecExact | PatternSpecPrefix;

/** trigger 表示用の日本語ラベル */
function labelForTrigger(tr?: "onMatch" | "onMismatch") {
  return tr === "onMatch" ? "一致したら報告" : "不一致なら報告";
}

/** PatternSpec → Rule 変換（ロジック共通化） */
function patternToRule(p: PatternSpec): Rule {
  // 後方互換：effectiveInversion が来たら trigger に変換
  const trigger: "onMatch" | "onMismatch" = p.trigger ?? (p.effectiveInversion === undefined ? "onMismatch" : p.effectiveInversion ? "onMatch" : "onMismatch");

  const base: Omit<Rule, "check"> = {
    id: p.id,
    description:
      "exactChildren" in p
        ? `親 "${(p as PatternSpecExact).parent}" の子が [${(p as PatternSpecExact).exactChildren.join(", ")}] と完全一致`
        : `親 "${(p as PatternSpecPrefix).parent}" の子が [${(p as PatternSpecPrefix).childrenStartsWith.join(", ")}] で始まる`,
    severity: (p as any).severity ?? "error",
    enabled: (p as any).enabled ?? true,
    kind: "exactChildren" in p ? "pattern-exact" : "pattern-prefix",
    trigger,
  };

  /** 診断を出すかどうかの最終判定 */
  const shouldReport = (ok: boolean) => (trigger === "onMatch" ? ok : !ok);

  if ("exactChildren" in p) {
    const expect = p.exactChildren;
    return {
      ...base,
      check: ({ node, path }) => {
        if (node.symbol !== p.parent) return;
        const actual = node.children?.map((c) => c.symbol) ?? [];
        const ok = actual.length === expect.length && actual.every((s, i) => s === expect[i]);

        if (!shouldReport(ok)) return;
        const message =
          p.message ??
          (ok
            ? `子要素が [${expect.join(", ")}] と完全一致しています。`
            : `子要素は [${expect.join(", ")}] と完全一致すべきですが、[${actual.join(", ")}] になっています。`);
        return [
          {
            ruleId: p.id,
            message,
            severity: base.severity!,
            path,
          },
        ];
      },
    };
  } else {
    const expect = p.childrenStartsWith;
    return {
      ...base,
      check: ({ node, path }) => {
        if (node.symbol !== p.parent) return;
        const actual = node.children?.map((c) => c.symbol) ?? [];
        const ok = actual.length >= expect.length && expect.every((s, i) => actual[i] === s);

        if (!shouldReport(ok)) return;
        const message =
          p.message ??
          (ok
            ? `子要素が [${expect.join(", ")}] で始まっています。`
            : `子要素は [${expect.join(", ")}] で始まるべきですが、[${actual.join(", ")}] になっています。`);
        return [
          {
            ruleId: p.id,
            message,
            severity: base.severity!,
            path,
          },
        ];
      },
    };
  }
}

/** ─────────────────────────────────────────────────────
 * 親コンポーネントから完全管理される props
 * ──────────────────────────────────────────────────── */
type Props = {
  tree: ParseTreeNode;
  title?: string;
  rules: Rule[];
  symbolCandidates: string[];
  onUpsertRule: (rule: Rule) => void;
  onToggleRule: (id: string, enabled: boolean) => void;
  onRemoveRule: (id: string) => void;
};

export default function LinterExercise({ tree, title = "Linter Exercise", rules, symbolCandidates, onUpsertRule, onToggleRule, onRemoveRule }: Props) {
  // ルール群から診断を計算
  const diagnostics = useMemo<Diagnostic[]>(() => {
    const out: Diagnostic[] = [];
    walk(tree, (ctx) => {
      for (const rule of rules) {
        if (!rule.enabled) continue;
        const res = rule.check(ctx);
        if (Array.isArray(res) && res.length) out.push(...res);
      }
    });
    // 重複排除（ruleId+path+message）
    const key = (d: Diagnostic) => `${d.ruleId}@${d.path.join(".")}:${d.message}`;
    const m = new Map<string, Diagnostic>();
    out.forEach((d) => m.set(key(d), d));
    return Array.from(m.values());
  }, [tree, rules]);

  const [focusPath, setFocusPath] = useState<number[] | null>(null);
  const focusedNode = focusPath ? findNodeByPath(tree, focusPath) : null;

  return (
    <div style={styles.container}>
      <h2 style={{ margin: "0 0 8px" }}>{title}</h2>

      <div style={styles.topRow}>
        <fieldset style={styles.rulesBox}>
          <legend style={styles.legend}>ルール</legend>

          <RuleBuilder symbolCandidates={symbolCandidates} onAdd={(spec) => onUpsertRule(patternToRule(spec))} existing={rules} />

          <ul style={{ margin: "12px 0 0", paddingLeft: 16 }}>
            {rules.map((r) => (
              <li key={r.id} style={{ marginBottom: 6, listStyle: "square" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <label style={{ cursor: "pointer", flex: "1 1 auto" }}>
                    <input type="checkbox" checked={!!(r.enabled ?? true)} onChange={(e) => onToggleRule(r.id, e.target.checked)} style={{ marginRight: 6 }} />
                    <strong>{r.id}</strong> <em style={{ color: colorBySeverity(r.severity ?? "error") }}>[{r.severity ?? "error"}]</em>{" "}
                    <span style={{ color: "#888" }}>
                      （{r.kind ?? "function"} / {labelForTrigger(r.trigger)}）
                    </span>
                    <div style={{ fontSize: 12, color: "#333" }}>{r.description}</div>
                  </label>
                  <button onClick={() => onRemoveRule(r.id)} style={styles.dangerBtn} title="このルールを削除">
                    削除
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </fieldset>

        <fieldset style={styles.diagBox}>
          <legend style={styles.legend}>Linterもどき診断</legend>
          {diagnostics.length === 0 ? (
            <div style={{ color: "#6a6a6a" }}>問題は検出されませんでした</div>
          ) : (
            <ol style={{ margin: 0, paddingLeft: 20 }}>
              {diagnostics.map((d, i) => (
                <li key={i} style={{ marginBottom: 6 }}>
                  <span
                    style={{
                      display: "inline-block",
                      minWidth: 60,
                      color: "#fff",
                      background: colorBySeverity(d.severity),
                      borderRadius: 4,
                      padding: "0 6px",
                      marginRight: 8,
                      fontSize: 12,
                    }}
                  >
                    {d.severity}
                  </span>
                  <code style={{ background: "#f6f6f6", padding: "1px 4px", borderRadius: 4 }}>{d.ruleId}</code> — {d.message}
                  <div style={{ fontSize: 12, color: "#666", marginTop: 2 }}>
                    <button onClick={() => setFocusPath(d.path)} style={styles.linkBtn} title="該当ノードへフォーカス">
                      node: {pathToString(tree, d.path)}
                    </button>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </fieldset>
      </div>

      <fieldset style={styles.treeBox}>
        <legend style={styles.legend}>Tree</legend>
        <TreeView root={tree} focusPath={focusPath} onSelectPath={setFocusPath} />
      </fieldset>

      {focusedNode && (
        <fieldset style={styles.detailBox}>
          <legend style={styles.legend}>フォーカス中ノード</legend>
          <div>
            <div>
              <strong>symbol:</strong> <code>{focusedNode.symbol}</code>
            </div>
            <div>
              <strong>path:</strong> <code>[{focusPath!.join(", ")}]</code>
            </div>
            <div>
              <strong>children:</strong> {focusedNode.children?.length ?? 0}
            </div>
          </div>
        </fieldset>
      )}
    </div>
  );
}

/** ─────────────────────────────────────────────────────
 * ルールビルダー（TextInput 採用）
 * ──────────────────────────────────────────────────── */
function RuleBuilder({ onAdd, existing, symbolCandidates }: { onAdd: (spec: PatternSpec) => void; existing: Rule[]; symbolCandidates: string[] }) {
  const [mode, setMode] = useState<"pattern-exact" | "pattern-prefix">("pattern-prefix");
  const [id, setId] = useState("");
  const [parent, setParent] = useState("");
  const [childrenText, setChildrenText] = useState("");
  const [severity, setSeverity] = useState<Severity>("error");
  const [message, setMessage] = useState("");
  // 発火条件：一致時に報告 or 不一致時に報告（デフォルトは不一致時）
  const [trigger, setTrigger] = useState<"onMatch" | "onMismatch">("onMismatch");

  const children = useMemo(
    () =>
      childrenText
        .split(/[,\s]+/)
        .map((s) => s.trim())
        .filter(Boolean),
    [childrenText]
  );

  const idClash = existing.some((r) => r.id === id);
  const canAdd = id.trim() && parent.trim() && children.length > 0 && !idClash;

  const handleAdd = () => {
    if (!canAdd) return;
    if (mode === "pattern-exact") {
      onAdd({
        id: id.trim(),
        parent: parent.trim(),
        exactChildren: children,
        message: message.trim() || undefined,
        severity,
        enabled: true,
        trigger,
      });
    } else {
      onAdd({
        id: id.trim(),
        parent: parent.trim(),
        childrenStartsWith: children,
        message: message.trim() || undefined,
        severity,
        enabled: true,
        trigger,
      });
    }
    // 入力状態リセット
    setId("");
    setParent("");
    setChildrenText("");
    setMessage("");
    setSeverity("error");
    setMode("pattern-prefix");
    setTrigger("onMismatch");
  };

  return (
    <div style={styles.builder}>
      <div style={styles.builderRow}>
        <label style={styles.lbl}>
          種類
          <select value={mode} onChange={(e) => setMode(e.target.value as "pattern-exact" | "pattern-prefix")} style={styles.input}>
            <option value="pattern-prefix">子要素 先頭一致</option>
            <option value="pattern-exact">子要素 完全一致</option>
          </select>
        </label>
        <label style={styles.lbl}>
          表示区分（重要度）
          <select value={severity} onChange={(e) => setSeverity(e.target.value as Severity)} style={styles.input}>
            <option value="error">error</option>
            <option value="warning">warning</option>
            <option value="info">info</option>
          </select>
        </label>
        <label style={styles.lbl}>
          発火条件
          <select value={trigger} onChange={(e) => setTrigger(e.target.value as "onMatch" | "onMismatch")} style={styles.input}>
            <option value="onMismatch">不一致なら報告</option>
            <option value="onMatch">一致したら報告</option>
          </select>
        </label>
      </div>

      <div style={styles.builderRow}>
        <label style={styles.lblWide}>
          ルール名（ユニーク）
          <input value={id} onChange={(e) => setId(e.target.value)} placeholder="例: pat.list-head" style={styles.input} />
          {idClash && <span style={{ color: "#d32f2f", fontSize: 12, marginLeft: 8 }}>その名前は既に使われています</span>}
        </label>
      </div>

      <div style={styles.builderRow}>
        <label style={styles.lbl}>
          親シンボル
          <TextInput
            text={parent}
            handler={setParent}
            candidates={symbolCandidates}
            matchMode="prefix"
            candidateAsDelimiter={true}
            wordDelimiter={/[\s\t\n\r.,;:(){}[\]"'`!?]+/}
            placeholder="例: LIST"
          />
        </label>

        <label style={styles.lblWide}>
          子（スペース/カンマ区切り）
          <TextInput
            text={childrenText}
            handler={setChildrenText}
            candidates={symbolCandidates}
            matchMode="prefix"
            candidateAsDelimiter={true}
            wordDelimiter={/[,\s\t\n\r]+/}
            placeholder="例: IfKeyword Identifier"
          />
        </label>
      </div>

      <div style={styles.builderRow}>
        <label style={styles.lblWide}>
          メッセージ（任意）
          <input value={message} onChange={(e) => setMessage(e.target.value)} placeholder="出したい診断メッセージ（空なら自動文言）" style={styles.input} />
        </label>
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <button
          onClick={handleAdd}
          disabled={!canAdd}
          style={canAdd ? styles.primaryBtn : styles.primaryBtnDisabled}
          title={canAdd ? "このルールを追加" : "必須項目を入力してください"}
        >
          ルールを追加
        </button>
        <span style={{ fontSize: 12, color: "#666" }}>
          {mode === "pattern-exact"
            ? `親 "${parent || "…"}" の子が [${children.join(", ") || "…"}] と完全一致（${labelForTrigger(trigger)}）`
            : `親 "${parent || "…"}" の子が [${children.join(", ") || "…"}] で始まる（${labelForTrigger(trigger)}）`}
        </span>
      </div>
    </div>
  );
}

/** Tree 表示（簡易） */
function TreeView({ root, focusPath, onSelectPath }: { root: ParseTreeNode; focusPath: number[] | null; onSelectPath: (p: number[] | null) => void }) {
  return (
    <div>
      <NodeItem node={root} path={[]} focusPath={focusPath} onSelectPath={onSelectPath} />
    </div>
  );
}
function NodeItem({
  node,
  path,
  focusPath,
  onSelectPath,
}: {
  node: ParseTreeNode;
  path: number[];
  focusPath: number[] | null;
  onSelectPath: (p: number[] | null) => void;
}) {
  const isFocused = !!(focusPath && focusPath.length === path.length && focusPath.every((v, i) => v === path[i]));
  return (
    <div style={{ margin: "4px 0 4px 16px" }}>
      <div
        onClick={() => onSelectPath(path)}
        style={{
          display: "inline-block",
          padding: "2px 6px",
          borderRadius: 6,
          border: isFocused ? "2px solid #2979ff" : "1px solid #bbb",
          background: isFocused ? "rgba(41,121,255,0.08)" : "#fff",
          cursor: "pointer",
        }}
        title="クリックでフォーカス"
      >
        <code>{node.symbol}</code>
        <span style={{ color: "#888", marginLeft: 6 }}>({node.children?.length ?? 0})</span>
      </div>
      {node.children?.length ? (
        <div>
          {node.children.map((ch, i) => (
            <NodeItem key={i} node={ch} path={[...path, i]} focusPath={focusPath} onSelectPath={onSelectPath} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** スタイル */
const styles: Record<string, React.CSSProperties> = {
  container: { fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, 'Apple Color Emoji'", lineHeight: 1.45, color: "#222" },
  topRow: { display: "grid", gridTemplateColumns: "2fr 3fr", gap: 16, alignItems: "start", marginBottom: 12 },
  rulesBox: { border: "1px solid #ddd", borderRadius: 8, padding: 12, background: "#fff" },
  diagBox: { border: "1px solid #ddd", borderRadius: 8, padding: 12, background: "#fff", maxHeight: 360, overflow: "auto" },
  treeBox: { border: "1px solid #ddd", borderRadius: 8, padding: 12, background: "#fff" },
  detailBox: { border: "1px solid #ddd", borderRadius: 8, padding: 12, background: "#fafafa", marginTop: 12 },
  legend: { fontWeight: 600, padding: "0 4px" },
  linkBtn: { padding: 0, border: "none", background: "none", color: "#2979ff", cursor: "pointer", textDecoration: "underline", fontSize: 12 },
  builder: { border: "1px dashed #ccc", borderRadius: 8, padding: 10, background: "#fcfcff", marginBottom: 12 },
  builderRow: { display: "flex", gap: 12, marginBottom: 8, alignItems: "center" },
  lbl: { display: "flex", flexDirection: "column", gap: 4, minWidth: 160 },
  lblWide: { display: "flex", flexDirection: "column", gap: 4, minWidth: 260, flex: "1 1 auto" },
  input: { padding: "6px 8px", border: "1px solid #ccc", borderRadius: 6, fontFamily: "inherit", fontSize: 14 },
  primaryBtn: { padding: "8px 12px", borderRadius: 8, border: "1px solid #1976d2", background: "#1976d2", color: "#fff", cursor: "pointer" },
  primaryBtnDisabled: { padding: "8px 12px", borderRadius: 8, border: "1px solid #a9c6e8", background: "#cfe3f8", color: "#fff", cursor: "not-allowed" },
  dangerBtn: { padding: "6px 10px", borderRadius: 8, border: "1px solid #d32f2f", background: "#fff", color: "#d32f2f", cursor: "pointer" },
};

function colorBySeverity(s: Severity): string {
  switch (s) {
    case "error":
      return "#d32f2f";
    case "warning":
      return "#f9a825";
    default:
      return "#1976d2";
  }
}
