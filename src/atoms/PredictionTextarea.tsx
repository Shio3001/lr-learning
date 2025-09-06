import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export type TextareaProps = {
  handler?: (t: string) => void;
  text?: string;
  /** 予測に使う語彙（かつ区切り候補としても使う） */
  candidates?: string[];
  /** 基本の区切り（空白・句読点など） */
  wordDelimiter?: RegExp;
  /** 前方一致 or 部分一致（候補フィルタ用） */
  matchMode?: "prefix" | "substring";
  /** 大文字小文字の区別（候補フィルタ＆候補区切りの両方に適用） */
  caseSensitive?: boolean;
  /** 表示する最大候補数 */
  maxSuggestions?: number;
  /** 候補単語を区切りとして使うか（デフォルト: true） */
  candidateAsDelimiter?: boolean;

  /** 置換ショートカット（例: epsilon → ε） */
  symbolShortcuts?: Array<{
    /** 入力側のキー（例: "epsilon"） */
    key: string;
    /** 確定時に挿入する文字列（例: "ε"） */
    value: string;
    /** このキーに対して候補を出す最小入力文字数（未指定は minShortcutTrigger を使用） */
    minTrigger?: number;
  }>;
  /** 置換ショートカットの全体デフォ最小文字数（既定: 2） */
  minShortcutTrigger?: number;
};

type Suggestion = {
  /** リストに表示するラベル */
  label: string;
  /** 挿入する実値 */
  insert: string;
  /** 重複排除用キー */
  id: string;
  /** ソースの種類 */
  source: "candidate" | "shortcut";
};

const defaultDelimiter = /[\s\t\n\r.,;:(){}[\]"'`!?]+/;

const styles = {
  wrapper: {
    position: "relative" as const,
    width: "100%",
  },
  textarea: {
    width: "100%",
    height: "200px",
    fontFamily: "monospace",
    fontSize: "30px",
  },
  list: {
    position: "absolute" as const,
    left: 0,
    right: 0,
    top: "100%",
    marginTop: 6,
    maxHeight: 240,
    overflowY: "auto" as const,
    border: "1px solid #ccc",
    borderRadius: 6,
    background: "#fff",
    boxShadow: "0 6px 20px rgba(0,0,0,0.12)",
    zIndex: 10,
  },
  item: (active: boolean) => ({
    padding: "8px 12px",
    cursor: "pointer",
    background: active ? "#f0f7ff" : "#fff",
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
  }),
  tag: {
    fontSize: 11,
    color: "#666",
    border: "1px solid #ddd",
    borderRadius: 4,
    padding: "0 6px",
    whiteSpace: "nowrap" as const,
  },
  hint: {
    fontSize: 12,
    color: "#888",
    padding: "6px 10px",
    borderTop: "1px solid #eee",
  },
};

function normalize(s: string, caseSensitive: boolean) {
  return caseSensitive ? s : s.toLowerCase();
}

function filterAndRank(rawWord: string, dict: string[], { caseSensitive, mode }: { caseSensitive: boolean; mode: "prefix" | "substring" }): string[] {
  const w = normalize(rawWord, caseSensitive);
  if (!w) return [];
  const n = (s: string) => normalize(s, caseSensitive);

  const prefix: string[] = [];
  const partial: string[] = [];

  for (const cand of dict) {
    const nc = n(cand);
    if (mode === "prefix") {
      if (nc.startsWith(w)) prefix.push(cand);
    } else {
      if (nc.startsWith(w)) prefix.push(cand);
      else if (nc.includes(w)) partial.push(cand);
    }
  }
  prefix.sort((a, b) => a.length - b.length);
  partial.sort((a, b) => a.length - b.length);
  return [...prefix, ...partial];
}

/** 候補語も“区切り”に含めたグローバル正規表現を生成 */
function buildBoundaryRegex(base: RegExp, candidates: string[], caseSensitive: boolean, candidateAsDelimiter: boolean): RegExp {
  const baseSrc = base.source;
  const baseFlags = base.flags.includes("g") ? base.flags : base.flags + "g";

  if (!candidateAsDelimiter || candidates.length === 0) {
    const flags = caseSensitive ? baseFlags.replace(/i/g, "") : baseFlags.includes("i") ? baseFlags : baseFlags + "i";
    return new RegExp(baseSrc, flags);
  }

  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = candidates
    .slice()
    .sort((a, b) => b.length - a.length)
    .map(esc)
    .join("|");

  let flags = "g";
  if (!caseSensitive) flags += "i";
  return new RegExp(`(?:${baseSrc})|(?:${pattern})`, flags);
}

/** “区切り”のマッチ位置列から、caret を含む単語範囲を計算 */
function pickWordRangeByRegex(text: string, caret: number, boundary: RegExp): { start: number; end: number; word: string } {
  boundary.lastIndex = 0;
  const seps: Array<{ s: number; e: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = boundary.exec(text)) !== null) {
    const s = m.index;
    const e = s + m[0].length;
    if (e === s) {
      boundary.lastIndex = e + 1;
    }
    seps.push({ s, e });
  }

  let prevEnd = 0;
  let nextStart = text.length;

  for (let i = 0; i < seps.length; i++) {
    const { s, e } = seps[i];
    if (e <= caret) prevEnd = Math.max(prevEnd, e);
    if (s >= caret) {
      nextStart = s;
      break;
    }
  }
  const start = prevEnd;
  const end = nextStart;
  const word = text.slice(start, end);
  return { start, end, word };
}

const Textarea = ({
  handler,
  text,
  candidates = [],
  wordDelimiter = defaultDelimiter,
  matchMode = "prefix",
  caseSensitive = false,
  maxSuggestions = 10,
  candidateAsDelimiter = true,
  symbolShortcuts = [], // 追加
  minShortcutTrigger = 2, // 追加（既定2）
}: TextareaProps) => {
  const [value, setValue] = useState(text ?? "");
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const [caret, setCaret] = useState(0);
  const taRef = useRef<HTMLTextAreaElement | null>(null);

  // 外部からtextが変わったら同期
  useEffect(() => {
    if (typeof text === "string" && text !== value) {
      setValue(text);
    }
  }, [text]); // eslint-disable-line react-hooks/exhaustive-deps

  // 候補も含めた“区切り”正規表現
  const boundaryRegex = useMemo(
    () => buildBoundaryRegex(wordDelimiter, candidates, caseSensitive, candidateAsDelimiter),
    [wordDelimiter, candidates, caseSensitive, candidateAsDelimiter]
  );

  const { start, end, word } = useMemo(() => pickWordRangeByRegex(value, caret, boundaryRegex), [value, caret, boundaryRegex]);

  // ---- 追加: ショートカット候補の生成 ----
  const shortcutSuggestions: Suggestion[] = useMemo(() => {
    const wNorm = normalize(word, caseSensitive);
    if (!wNorm) return [];
    const out: Suggestion[] = [];

    for (const sc of symbolShortcuts) {
      const keyNorm = normalize(sc.key, caseSensitive);
      const trigger = sc.minTrigger ?? minShortcutTrigger;

      if (wNorm.length >= trigger) {
        // 前方一致で出す（必要なら substring 対応に拡張可）
        if (keyNorm.startsWith(wNorm)) {
          out.push({
            id: `shortcut:${sc.key}->${sc.value}`,
            label: sc.value, // 表示は置換後文字を大きく見せたい
            insert: sc.value, // 確定時に挿入
            source: "shortcut",
          });
        }
      }
    }

    // 表示上の安定性：value の長さ（=文字幅）で軽くソート
    out.sort((a, b) => a.insert.length - b.insert.length);
    return out;
  }, [word, symbolShortcuts, caseSensitive, minShortcutTrigger]);

  // 既存の通常候補
  const normalCandidateSuggestions: Suggestion[] = useMemo(() => {
    if (!candidates?.length) return [];
    const filtered = filterAndRank(word, candidates, {
      caseSensitive,
      mode: matchMode,
    });
    return filtered.map<Suggestion>((s) => ({
      id: `cand:${s}`,
      label: s,
      insert: s,
      source: "candidate",
    }));
  }, [word, candidates, caseSensitive, matchMode]);

  // マージ & 重複排除（insert 基準で一意化） & 上限
  const suggestions: Suggestion[] = useMemo(() => {
    const map = new Map<string, Suggestion>();
    // ショートカットを優先的に先に詰める
    for (const s of shortcutSuggestions) {
      if (!map.has(s.insert)) map.set(s.insert, s);
    }
    for (const s of normalCandidateSuggestions) {
      if (!map.has(s.insert)) map.set(s.insert, s);
    }
    return Array.from(map.values()).slice(0, maxSuggestions);
  }, [shortcutSuggestions, normalCandidateSuggestions, maxSuggestions]);

  useEffect(() => {
    setOpen(suggestions.length > 0 && word.length > 0);
    setActiveIdx(0);
  }, [suggestions.length, word]);

  const commit = useCallback(
    (chosen: Suggestion) => {
      const next = value.slice(0, start) + chosen.insert + value.slice(end);
      const nextCaret = start + chosen.insert.length;
      setValue(next);
      setOpen(false);
      handler?.(next);
      requestAnimationFrame(() => {
        const el = taRef.current;
        if (!el) return;
        el.focus();
        el.setSelectionRange(nextCaret, nextCaret);
        setCaret(nextCaret);
      });
    },
    [end, handler, start, value]
  );

  const onChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const v = e.target.value;
    setValue(v);
    handler?.(v);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!open || suggestions.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => (i + 1) % suggestions.length);
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => (i - 1 + suggestions.length) % suggestions.length);
      return;
    }
    if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      commit(suggestions[activeIdx]);
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      return;
    }
  };

  const onClickItem = (idx: number) => commit(suggestions[idx]);

  const onSelect = () => {
    const el = taRef.current;
    if (!el) return;
    setCaret(el.selectionStart ?? 0);
  };

  return (
    <div style={styles.wrapper}>
      <textarea
        ref={taRef}
        value={value}
        onChange={onChange}
        onKeyDown={onKeyDown}
        onClick={onSelect}
        onKeyUp={onSelect}
        onFocus={onSelect}
        className="my-textarea"
        placeholder="Enter text here"
        spellCheck={false}
        style={styles.textarea}
      />
      {open && (
        <div style={styles.list} role="listbox" aria-label="予測候補">
          {suggestions.map((s, i) => (
            <div
              key={s.id}
              style={styles.item(i === activeIdx)}
              onMouseEnter={() => setActiveIdx(i)}
              onMouseDown={(e) => {
                e.preventDefault(); // blur前に確定
                onClickItem(i);
              }}
              role="option"
              aria-selected={i === activeIdx}
            >
              <span>{s.label}</span>
              <span style={styles.tag}>{s.source === "shortcut" ? "置換" : "候補"}</span>
            </div>
          ))}
          <div style={styles.hint}>↑↓で選択 / Enter・Tabで確定 / Escで閉じる</div>
        </div>
      )}
    </div>
  );
};

export default Textarea;
