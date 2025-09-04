import { ParseTreeNode } from "../compiler/interface/tree";
import { Rule } from "./../component/LinterExercise";

// --- デモ用ツリー（差し替えOK）
export const demoTree: ParseTreeNode = {
  symbol: "S",
  children: [
    {
      symbol: "LIST",
      children: [
        { symbol: "IfKeyword", children: [] },
        { symbol: "Identifier", children: [] },
        { symbol: "StmtTail", children: [] },
      ],
    },
    { symbol: "EoF", children: [] },
  ],
};

// --- 初期ルール例
export const bootRules: Rule[] = [
  {
    id: "pat.if-head",
    description: 'Parent "LIST" must start children with: IfKeyword Identifier',
    severity: "error",
    enabled: true,
    kind: "pattern-prefix",
    check: ({ node, path }) => {
      if (node.symbol !== "LIST") return;
      const actual = node.children?.map((c) => c.symbol) ?? [];
      const expect = ["IfKeyword", "Identifier"];
      const ok = actual.length >= expect.length && expect.every((s, i) => actual[i] === s);
      if (!ok) {
        return [
          {
            ruleId: "pat.if-head",
            message: `Children must start with: [${expect.join(", ")}], but got [${actual.join(", ")}]`,
            severity: "error",
            path,
          },
        ];
      }
    },
  },
  {
    id: "node.no-empty-symbol",
    description: "空文字や空白だけの symbol を禁止",
    severity: "error",
    enabled: true,
    kind: "function",
    check: ({ node, path }) => {
      if (!node.symbol || node.symbol.trim() === "") {
        return [
          {
            ruleId: "node.no-empty-symbol",
            message: "空の symbol が見つかりました。",
            severity: "error",
            path,
          },
        ];
      }
    },
  },
];

// --- リンター用ストア & リデューサ
export type LinterStore = {
  //   reservedWords: string[];
  ruleList: Rule[];
};

type LinterAction =
  //   | { type: "LINT_RESERVED_SET"; payload: string[] }
  | { type: "LINT_RESERVED_ADD"; payload: string }
  | { type: "LINT_RULE_UPSERT"; payload: Rule }
  | { type: "LINT_RULE_TOGGLE"; id: string; enabled: boolean }
  | { type: "LINT_RULE_REMOVE"; id: string };

export function linterReducer(store: LinterStore, action: LinterAction): LinterStore {
  switch (action.type) {
    // case "LINT_RESERVED_SET": {
    //   return { ...store, reservedWords: Array.from(new Set(action.payload)) };
    // }
    case "LINT_RESERVED_ADD": {
      return {
        ...store,
        // reservedWords: Array.from(new Set([...store.reservedWords, action.payload])),
      };
    }
    case "LINT_RULE_UPSERT": {
      console.log("LinterReducer: UPSERT", action.payload);
      const idx = store.ruleList.findIndex((r) => r.id === action.payload.id);
      if (idx >= 0) {
        const next = store.ruleList.slice();
        next[idx] = action.payload;
        return { ...store, ruleList: next };
      }
      return { ...store, ruleList: [...store.ruleList, action.payload] };
    }
    case "LINT_RULE_TOGGLE": {
      return {
        ...store,
        ruleList: store.ruleList.map((r) => (r.id === action.id ? { ...r, enabled: action.enabled } : r)),
      };
    }
    case "LINT_RULE_REMOVE": {
      return { ...store, ruleList: store.ruleList.filter((r) => r.id !== action.id) };
    }
    default:
      return store;
  }
}
