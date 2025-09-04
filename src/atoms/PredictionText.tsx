import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export type TextInputProps = {
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
  /** 追加クラス名（任意） */
  className?: string;
  /** placeholder（任意） */
  placeholder?: string;
};

const defaultDelimiter = /[\s\t\n\r.,;:(){}[\]"'`!?]+/;

const styles = {
  wrapper: {
    position: "relative" as const,
    width: "100%",
  },
  input: {
    width: "100%",
    padding: "6px 8px",
    border: "1px solid #ccc",
    borderRadius: 6,
    fontFamily: "inherit",
    fontSize: 14,
    boxSizing: "border-box" as const,
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
  }),
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
    if (e === s) boundary.lastIndex = e + 1; // 念のため
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

const TextInput = ({
  handler,
  text,
  candidates = [],
  wordDelimiter = defaultDelimiter,
  matchMode = "prefix",
  caseSensitive = false,
  maxSuggestions = 10,
  candidateAsDelimiter = true,
  className,
  placeholder = "Enter text here",
}: TextInputProps) => {
  const [value, setValue] = useState(text ?? "");
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const [caret, setCaret] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // 外部からtextが変わったら同期
  useEffect(() => {
    if (typeof text === "string" && text !== value) {
      setValue(text);
    }
  }, [text]); // eslint-disable-line react-hooks/exhaustive-deps

  // 区切りの正規表現
  const boundaryRegex = useMemo(
    () => buildBoundaryRegex(wordDelimiter, candidates, caseSensitive, candidateAsDelimiter),
    [wordDelimiter, candidates, caseSensitive, candidateAsDelimiter]
  );

  const { start, end, word } = useMemo(() => pickWordRangeByRegex(value, caret, boundaryRegex), [value, caret, boundaryRegex]);

  const suggestions = useMemo(() => {
    if (!candidates?.length) return [];
    return filterAndRank(word, candidates, {
      caseSensitive,
      mode: matchMode,
    }).slice(0, maxSuggestions);
  }, [word, candidates, caseSensitive, matchMode, maxSuggestions]);

  useEffect(() => {
    setOpen(suggestions.length > 0 && word.length > 0);
    setActiveIdx(0);
  }, [suggestions.length, word]);

  const commit = useCallback(
    (chosen: string) => {
      const next = value.slice(0, start) + chosen + value.slice(end);
      const nextCaret = start + chosen.length;
      setValue(next);
      setOpen(false);
      handler?.(next);
      requestAnimationFrame(() => {
        const el = inputRef.current;
        if (!el) return;
        el.focus();
        el.setSelectionRange(nextCaret, nextCaret);
        setCaret(nextCaret);
      });
    },
    [end, handler, start, value]
  );

  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    setValue(v);
    handler?.(v);
    // caret は onSelect で更新
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
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
    const el = inputRef.current;
    if (!el) return;
    setCaret(el.selectionStart ?? 0);
  };

  return (
    <div style={styles.wrapper}>
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={onChange}
        onKeyDown={onKeyDown}
        onClick={onSelect}
        onKeyUp={onSelect}
        onFocus={onSelect}
        className={className}
        placeholder={placeholder}
        spellCheck={false}
        style={styles.input}
      />
      {open && (
        <div style={styles.list} role="listbox" aria-label="予測候補">
          {suggestions.map((s, i) => (
            <div
              key={`${s}-${i}`}
              style={styles.item(i === activeIdx)}
              onMouseEnter={() => setActiveIdx(i)}
              onMouseDown={(e) => {
                e.preventDefault(); // blur前に確定
                onClickItem(i);
              }}
              role="option"
              aria-selected={i === activeIdx}
            >
              {s}
            </div>
          ))}
          <div style={styles.hint}>↑↓で選択 / Enter・Tabで確定 / Escで閉じる</div>
        </div>
      )}
    </div>
  );
};

export default TextInput;
