import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export type TextareaProps = {
  handler?: (t: string) => void;
  text?: string;
  /** 予測に使う語彙 */
  candidates?: string[];
  /** 単語区切りの判定（デフォ: 空白系） */
  wordDelimiter?: RegExp;
  /** 前方一致 or 部分一致 */
  matchMode?: "prefix" | "substring";
  /** 大文字小文字を区別するか */
  caseSensitive?: boolean;
  /** 表示する最大候補数 */
  maxSuggestions?: number;
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

function pickWordRange(text: string, caret: number, delimiter: RegExp): { start: number; end: number; word: string } {
  const len = text.length;
  let s = caret - 1;
  while (s >= 0 && !delimiter.test(text[s])) s--;
  let e = caret;
  while (e < len && !delimiter.test(text[e])) e++;
  const start = Math.max(0, s + 1);
  const end = e;
  const word = text.slice(start, end);
  return { start, end, word };
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

  // 簡易スコア: 前方一致を先に、長さが短いもの優先
  prefix.sort((a, b) => a.length - b.length);
  partial.sort((a, b) => a.length - b.length);

  return [...prefix, ...partial];
}

const Textarea = ({
  handler,
  text,
  candidates = [],
  wordDelimiter = defaultDelimiter,
  matchMode = "prefix",
  caseSensitive = false,
  maxSuggestions = 10,
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

  const { start, end, word } = useMemo(() => pickWordRange(value, caret, wordDelimiter), [value, caret, wordDelimiter]);

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
      // 反映
      handler?.(next);
      // caretを戻す
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
    // selectionStart はカーソル位置（または選択開始位置）
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
              key={`${s}-${i}`}
              style={styles.item(i === activeIdx)}
              onMouseEnter={() => setActiveIdx(i)}
              onMouseDown={(e) => {
                // textareaのフォーカスが外れる前に確定する
                e.preventDefault();
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

export default Textarea;
