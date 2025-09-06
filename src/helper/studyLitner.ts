import { ParseTreeNode } from "../compiler/interface/tree";
import { Rule } from "./../component/LinterExercise";
import { PatternSpecBase, Diagnostic, RuleContext } from "./../component/LinterExercise";
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
    id: "func.no-else-if",
    description: 'Function "no-else-if": 「else if」は使わない',
    severity: "warning",
    enabled: true,
    kind: "function",
    check: ({ node, path }) => {
      if (node.symbol !== "TAIL") return;
      const actual = node.children?.map((c) => c.symbol) ?? [];
      for (let i = 0; i < actual.length - 1; i++) {
        if (actual[i] === "ElseKeyword" && actual[i + 1] === "IfKeyword") {
          return [
            {
              ruleId: "func.no-else-if",
              message: `「else if」は使わないでください。`,
              severity: "warning",
              path,
            },
          ];
        }
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
