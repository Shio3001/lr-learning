// file: src/page/MainPage.tsx
import Textarea from "../atoms/Textarea";
import PredictionTextarea from "../atoms/PredictionTextarea";

import { getRawBNFWarningThrows, parseRawBnf, getTerminalSymbols, getLeftSymbols } from "../compiler/parseBnf";
import lr0 from "../compiler/lr0";
import lr1 from "../compiler/lr1";
import { BNFSet } from "../compiler/interface/bnf";

import { useEffect, useState, useReducer, Suspense, lazy, useMemo, useDeferredValue, useTransition } from "react";
import AutomatonGraph from "../component/AutomatonGraph";
import { ReactFlowProvider } from "@xyflow/react";

import { makeTransitionTable } from "../compiler/makeTable";
import { makeTransitionTableLR1 } from "../compiler/makeTableLR1";
import type { TransitionTable } from "../compiler/interface/transitionTable";
import LRTable from "../component/LRTable";
import { parseProgram } from "../compiler/parseProgram";
import { Token, lex, getTsSyntaxKindList } from "./../compiler/tsLexerLib";
import LinterExercise from "../component/LinterExercise";
import type { ParseTreeNode, ParseLog } from "../compiler/interface/tree";
import { linterReducer, bootRules } from "../helper/studyLitner";
import { ViewConflict } from "../component/ViewConflict";

import type { LRItemSet as LR0ItemSet } from "../compiler/interface/lr0ItemSet";
import type { LR1ItemSet } from "../compiler/interface/lr1ItemSet";

const LazyTreesSection = lazy(() => import("../component/ParseTimeline"));

// 補助型
type ParseLogs = (string | ParseLog)[];
type LrSets = LR0ItemSet[] | LR1ItemSet[];
type Tab = "lex" | "parse" | "lrauto" | "lint";

const MainPage = () => {
  const [activeTab, setActiveTab] = useState<Tab>("lex");

  const [bnf, setBnf] = useState<string>("S->LIST 'EoF'\nLIST->'LPAR' SEQ 'RPAR' | 'NUM'\nSEQ -> LIST\nSEQ -> SEQ 'COMMA' LIST");
  const [program, setProgram] = useState<string>("");
  const [algorithm, setAlgorithm] = useState<"LR0" | "LR1" | "LR1-L">("LR0");

  // localStorage 復元（try/catch維持）
  useEffect(() => {
    try {
      const savedBnf = localStorage.getItem("bnf");
      if (savedBnf) setBnf(savedBnf);
      const savedProgram = localStorage.getItem("program");
      if (savedProgram) setProgram(savedProgram);
      const savedAlgorithm = localStorage.getItem("algorithm") as "LR0" | "LR1" | null;
      if (savedAlgorithm) setAlgorithm(savedAlgorithm);
    } catch (e) {
      console.error(e);
    }
  }, []);
  // 保存（try/catch維持）
  useEffect(() => {
    try {
      localStorage.setItem("bnf", bnf);
    } catch (e) {
      console.error(e);
    }
  }, [bnf]);
  useEffect(() => {
    try {
      localStorage.setItem("program", program);
    } catch (e) {
      console.error(e);
    }
  }, [program]);
  useEffect(() => {
    try {
      localStorage.setItem("algorithm", algorithm);
    } catch (e) {
      console.error(e);
    }
  }, [algorithm]);

  // タイプ中の優先度を下げてカクつき抑制
  const deferredProgram = useDeferredValue(program);
  const [, /*isPending*/ startTransition] = useTransition();

  // lex は重いのでメモ化（try/catch維持）
  const tokens = useMemo(() => {
    try {
      return lex(deferredProgram);
    } catch (e) {
      console.error(e);
      return [] as Token[];
    }
  }, [deferredProgram]);

  // kinds / 予約語まわり
  const kinds = useMemo(() => Array.from(new Set(tokens.map((t: Token) => t.kind))), [tokens]);
  const tsKinds = useMemo(() => getTsSyntaxKindList(), []);
  const allKinds = useMemo(() => Array.from(new Set([...kinds, ...tsKinds])), [kinds, tsKinds]);
  const leftSymbols = useMemo(() => getLeftSymbols(bnf, kinds), [bnf, kinds]);
  const reservedWords = useMemo(() => [...kinds, "->", ...leftSymbols, "|"], [kinds, leftSymbols]);

  // BNF セット・警告
  const bnfWarnings = useMemo(() => getRawBNFWarningThrows(bnf, allKinds), [bnf, allKinds]);
  const bnfSet = useMemo(() => (bnfWarnings.length === 0 ? parseRawBnf(bnf, allKinds) : new BNFSet()), [bnfWarnings, bnf, allKinds]);
  const terminals = useMemo(() => getTerminalSymbols(bnfSet), [bnfSet]);

  // ---- lr0/lr1 は useEffect で実行（try/catch維持） ----
  const [lrItemSets, setLrItemSets] = useState<LrSets>([] as LrSets);
  const [lrItemsError, setLrItemsError] = useState<Error | null>(null);

  useEffect(() => {
    let canceled = false;
    (async () => {
      try {
        setLrItemsError(null);
        const next = algorithm === "LR0" ? (lr0(bnfSet) as LR0ItemSet[]) : (lr1(bnfSet) as LR1ItemSet[]);
        if (!canceled) setLrItemSets(next);
      } catch (e) {
        if (!canceled) {
          setLrItemSets([] as LrSets);
          setLrItemsError(e as Error);
          console.error(e);
        }
      }
    })();
    return () => {
      canceled = true;
    };
  }, [algorithm, bnfSet]);

  // LR表（Reducer + try/catch維持）
  const [table, setTable] = useReducer((state: TransitionTable, action: any) => (action.type === "SET_TABLE" ? action.payload : state), [] as TransitionTable);

  useEffect(() => {
    try {
      const newTable: TransitionTable =
        algorithm === "LR0"
          ? makeTransitionTable(lrItemSets as LR0ItemSet[], bnfSet)
          : makeTransitionTableLR1(lrItemSets as LR1ItemSet[], bnfSet, algorithm === "LR1-L");
      setTable({ type: "SET_TABLE", payload: newTable });
    } catch (e) {
      console.error(e);
      setTable({ type: "SET_TABLE", payload: [] });
    }
  }, [algorithm, lrItemSets, bnfSet]);

  // 構文解析ログ（string or 配列）を保持（try/catch維持）
  const [trees, setTrees] = useState<string | ParseLogs>([] as ParseLogs);

  useEffect(() => {
    let canceled = false;
    startTransition(() => {
      try {
        const result = parseProgram(tokens, table);
        if (!canceled) setTrees(result.log as ParseLogs);
      } catch (e) {
        if (!canceled) setTrees(String(e));
      }
    });
    return () => {
      canceled = true;
    };
  }, [tokens, table, startTransition]);

  // Linter 用の最終ツリー抽出
  const linterTree: ParseTreeNode = useMemo(() => {
    if (Array.isArray(trees)) {
      for (let i = trees.length - 1; i >= 0; i--) {
        const t = trees[i];
        if (typeof t !== "string") return (t as ParseLog).tree;
      }
    }
    return { symbol: "Error", children: [] };
  }, [trees]);

  // Linter reducer
  const [linterStore, sendLinter] = useReducer(linterReducer, {
    ruleList: bootRules,
  });
  const bnfCandidates = useMemo(() => reservedWords.filter((k) => k !== "S" && k.length > 1), [reservedWords]);

  // ---- Tabs UI（超シンプル CSS） ----
  const tabBtn = (id: Tab, label: string) => (
    <button
      onClick={() => setActiveTab(id)}
      style={{
        padding: "8px 12px",
        border: "1px solid #ccc",
        borderBottom: activeTab === id ? "2px solid #000" : "1px solid #ccc",
        background: activeTab === id ? "#fff" : "#f7f7f7",
        cursor: "pointer",
        marginRight: 8,
        fontWeight: activeTab === id ? 700 : 400,
      }}
    >
      {label}
    </button>
  );

  return (
    <div>
      <h1>プログラミング言語処理系 支援サイト</h1>

      <div style={{ marginBottom: 12 }}>
        {tabBtn("lex", "字句解析")}
        {tabBtn("parse", "構文解析")}
        {tabBtn("lrauto", "LRオートマトン")}
        {tabBtn("lint", "静的解析（Linter）")}
      </div>

      {/* ===== 字句解析タブ ===== */}
      {activeTab === "lex" && (
        <section>
          <h2>字句解析</h2>
          <h3>入力プログラム</h3>
          <Textarea text={program} handler={setProgram} />
          <h3>トークン（TypeScript 処理系準拠）</h3>
          {/* <pre>{JSON.stringify(tokens, null, 2)}</pre> */}

          {/* 表形式で tokenとkindを横に表示 */}
          <table style={{ borderCollapse: "collapse", width: "100%" }}>
            <thead>
              <tr>
                <th style={{ border: "1px solid #ccc", padding: 8, textAlign: "left" }}>Token</th>
                <th style={{ border: "1px solid #ccc", padding: 8, textAlign: "left" }}>Kind</th>
              </tr>
            </thead>
            <tbody>
              {tokens.map((t, i) => (
                <tr key={i}>
                  <td style={{ border: "1px solid #ccc", padding: 8, fontFamily: "monospace", whiteSpace: "pre-wrap", wordBreak: "break-all" }}>{t.text}</td>
                  <td style={{ border: "1px solid #ccc", padding: 8, fontFamily: "monospace" }}>{t.kind}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {/* ===== 構文解析タブ ===== */}
      {activeTab === "parse" && (
        <section>
          <h2>構文解析</h2>

          <h3>使用するアルゴリズムを選択してください</h3>
          <div>
            <label>
              <input type="radio" value="LR0" checked={algorithm === "LR0"} onChange={() => setAlgorithm("LR0")} />
              LR(0)法
            </label>
            <label style={{ marginLeft: 12 }}>
              <input type="radio" value="LR1" checked={algorithm === "LR1"} onChange={() => setAlgorithm("LR1")} />
              LR(1)法
            </label>
            <label style={{ marginLeft: 12 }}>
              <input type="radio" value="LR1-L" checked={algorithm === "LR1-L"} onChange={() => setAlgorithm("LR1-L")} />
              LR(1)法（SHIFT優先）
            </label>
          </div>

          <div>
            <p>字句解析トークン一覧（{tokens.length}個）:</p>
            {/* token0 token1 token2 */}
            {/* kind0 kind1 kind2 のようにtokenが横になるようにtableではなくdivで表っぽく表示  */}
            {/* 子要素要素幅に合わせること 横幅100px  */}
            {/* {要素そのものを新しく作る  } */}
            <div style={{ display: "flex", flexWrap: "wrap" }}>
              {tokens.map((t, i) => (
                <div
                  key={i}
                  style={{
                    border: "1px solid #ccc",
                    padding: "4px 8px",
                    fontFamily: "monospace",
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-all",
                    minWidth: 130,
                    marginBottom: 4,
                  }}
                  title={t.text}
                >
                  {t.text}
                  <br />
                  <span style={{ color: "#888" }}>{t.kind}</span>
                </div>
              ))}
            </div>
          </div>

          <hr style={{ margin: "20px 0" }} />

          <h3>構文定義（BNF）</h3>
          <PredictionTextarea text={bnf} handler={setBnf} candidates={bnfCandidates} symbolShortcuts={[{ key: "epsilon", value: "ε", minTrigger: 2 }]} />
          <h4>現在の構文解析予約語一覧</h4>
          <p>{reservedWords.join(" ")}</p>
          <p>空集合εを入力するには、epsilonを入力してください</p>

          <h5>上記に加えて、以下のワードも終端記号として認識されます。</h5>
          <p style={{ fontSize: 10 }}>{tsKinds.join(" ")}</p>

          {/* BNF エラー表示 */}
          <div>
            {bnfWarnings.map((e, i) => (
              <p key={i} style={{ color: e.isError ? "red" : "orange" }}>
                (行: {e.line}) {e.error}
              </p>
            ))}
          </div>

          {/* lr0/lr1 生成エラー表示（throwは潰さずUIで可視化） */}
          {lrItemsError && <p style={{ color: "red" }}>LRアイテム生成でエラー: {lrItemsError.message}</p>}

          {/* オートマトン可視化 */}
          {/* <div>
            <ReactFlowProvider>
              <AutomatonGraph terminals={terminals} lrItemSets={lrItemSets as any} />
            </ReactFlowProvider>
          </div> */}

          <LRTable table={table} lightUpState={null} lightUpToken={null} />
          <p>コンフリクトが発生しているセルは赤色で表示されます。</p>
          <ViewConflict table={table} />

          {/* 解析タイムライン（string の場合は配列化して渡す） */}
          <Suspense fallback={<div>構文解析ビュー読込中…</div>}>
            <LazyTreesSection trees={Array.isArray(trees) ? trees : ([trees] as ParseLogs)} table={table} />
          </Suspense>
        </section>
      )}
      {
        /* ===== LRオートマトンタブ ===== */
        activeTab === "lrauto" && (
          <section>
            <h2>LRオートマトン</h2>
            <p>LR(0)法またはLR(1)法で生成されたLRオートマトンを可視化します。</p>
            <div>
              <h4>構文一覧</h4>
              <ul>
                {/* BNFSetからgetBNFs */}
                {bnfSet.getBNFs().map((b, i) => (
                  <li key={i} style={{ fontFamily: "monospace", fontSize: 24 }}>
                    {b.getLeft()} &rarr;{" "}
                    {b
                      .getRight()
                      .map((c) =>
                        c
                          .getElements()
                          .map((e) => e.getValue())
                          .join(" ")
                      )
                      .join(" | ")}
                  </li>
                ))}
              </ul>
            </div>
            <p>ノード数: {lrItemSets.length}</p>
            <ReactFlowProvider>
              <AutomatonGraph terminals={terminals} lrItemSets={lrItemSets as any} />
            </ReactFlowProvider>
          </section>
        )
      }

      {/* ===== 静的解析（Linter）タブ ===== */}
      {activeTab === "lint" && (
        <section>
          <h2>静的解析（Linter）</h2>
          <LinterExercise
            onUpsertRule={(rule) => sendLinter({ type: "LINT_RULE_UPSERT", payload: rule })}
            onToggleRule={(id, enabled) => sendLinter({ type: "LINT_RULE_TOGGLE", id, enabled })}
            onRemoveRule={(id) => sendLinter({ type: "LINT_RULE_REMOVE", id })}
            rules={linterStore.ruleList}
            symbolCandidates={["ROOT", ...kinds, ...leftSymbols]}
            tree={linterTree}
          />
        </section>
      )}
    </div>
  );
};

export default MainPage;
