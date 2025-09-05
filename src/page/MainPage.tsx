import Textarea from "../atoms/Textarea";
import PredictionTextarea from "../atoms/PredictionTextarea";
import Button from "../atoms/Button";

import { getRawBNFWarningThrows, parseRawBnf, getTerminalSymbols, getLeftSymbols } from "../compiler/parseBnf";
import lr0 from "../compiler/lr0";
import lr1 from "../compiler/lr1";
import { BNFSet, BNFElement, BNFConcatenation } from "../compiler/interface/bnf";

import { useEffect, useState, useReducer } from "react";
import AutomatonGraph from "../component/AutomatonGraph";

import { ReactFlowProvider } from "@xyflow/react";

import { makeTransitionTable } from "../compiler/makeTable";
import { makeTransitionTableLR1 } from "../compiler/makeTableLR1";
import { TransitionTable } from "../compiler/interface/transitionTable";
import LRTable from "../component/LRTable";
import { parseProgram } from "../compiler/parseProgram";
import { Token, lex, getTsSyntaxKindList } from "./../compiler/tsLexerLib";
import TreeView from "../component/TreeView";
import LinterExercise from "../component/LinterExercise";
import { ParseTreeNode, ParseLog } from "../compiler/interface/tree";
import { linterReducer, bootRules } from "../helper/studyLitner";
import { ViewConflict } from "../component/ViewConflict";

const MainPage = () => {
  // const [bnf, setBnf] = useState<string>("S->STMT 'EoF'\nSTMT->'Ex' EXP\nEXP->'NUM'");
  const [bnf, setBnf] = useState<string>("S->LIST 'EoF'\nLIST->'LPAR' SEQ 'RPAR' | 'NUM'\nSEQ -> LIST\nSEQ -> SEQ 'COMMA' LIST");
  const [program, setProgram] = useState<string>("");

  //アルゴリズム
  const [algorithm, setAlgorithm] = useState<"LR0" | "LR1">("LR0");

  //const lrtableを可視化したもの useReducer
  const [table, setTable] = useReducer((state, action) => {
    switch (action.type) {
      case "SET_TABLE":
        console.log("SET_TABLE tableを更新しました", algorithm, action.payload);
        return action.payload;
      default:
        return state;
    }
  }, []);
  // const kinds = lex(program).map((t: Token) => t.kind); をuseMemoでメモ化programが変わったときだけ更新
  const [kinds, setKinds] = useState<string[]>([]);

  useEffect(() => {
    const tokens = lex(program);
    // const tsKinds = getTsSyntaxKindList();
    // const uniqueKinds = Array.from(new Set(tokens.map((t: Token) => t.kind).concat(tsKinds)));

    const uniqueKinds = Array.from(new Set(tokens.map((t: Token) => t.kind)));
    setKinds(uniqueKinds);
  }, [program]);

  const handlerAllKinds = () => {
    return Array.from(new Set([...kinds, ...getTsSyntaxKindList()]));
  };

  const handlerReservedWords = () => {
    return [...kinds, "->", ...handlerLeft(), "|"];
  };

  const handlerRawBNFWarning = () => {
    return getRawBNFWarningThrows(bnf, handlerAllKinds());
  };

  const handlerBNFset = () => {
    return handlerRawBNFWarning().length === 0 ? parseRawBnf(bnf, handlerAllKinds()) : new BNFSet();
  };

  const handlerTerminal = () => {
    return getTerminalSymbols(handlerBNFset());
  };

  const handlerLeft = () => {
    return getLeftSymbols(bnf, kinds);
  };

  const handlerLR0ItemSets = () => {
    return lr0(handlerBNFset());
  };

  const handlerLR1ItemSets = () => {
    return lr1(handlerBNFset());
  };

  const handlerLRItemSets = () => {
    return algorithm === "LR0" ? handlerLR0ItemSets() : handlerLR1ItemSets();
  };

  const getTrees = () => {
    try {
      const result = parseProgram(lex(program), table);
      return result.log;
    } catch (e) {
      console.error(e);
      //stringにして返す
      const es = (e as Error).toString();
      return es;
    }
  };

  const getTreesComponent = () => {
    const trees = getTrees();
    if (typeof trees === "string") {
      return (
        // エラーが文字列で返ってきた場合
        <div>
          <h2>構文解析木</h2>
          <p style={{ color: "red" }}>{trees}</p>
        </div>
      );
    }
    // treesが空配列なら、構文解析木はありませんと表示

    if (trees.length === 0) {
      return <p>構文解析木はありません。</p>;
    }
    return (
      <div>
        <h2>構文解析木</h2>
        {trees.map((log, index) =>
          (() => {
            if (typeof log === "string") {
              return (
                // エラーが文字列で返ってきた場合
                <div key={index}>
                  <p style={{ color: "red" }}>{log}</p>
                </div>
              );
            }

            return (
              <div key={index} style={{ border: "1px solid black", marginBottom: "10px", padding: "10px" }}>
                <p>
                  <strong>ステップ {index + 1}:</strong> 状態 {log.state} にてトークン '{log.token}' を処理
                </p>
                <LRTable table={table} lightUpState={log.state} lightUpToken={log.token}></LRTable>
                <div
                  style={{
                    width: "25%",
                  }}
                >
                  <TreeView root={log.tree} />
                </div>
              </div>
            );
          })()
        )}
      </div>
    );
  };

  useEffect(() => {
    (async () => {
      try {
        // const newTable: TransitionTable = makeTransitionTable(handlerLRItemSets(), handlerBNFset());
        const newTable: TransitionTable =
          algorithm === "LR0" ? makeTransitionTable(handlerLR0ItemSets(), handlerBNFset()) : makeTransitionTableLR1(handlerLR1ItemSets(), handlerBNFset());
        setTable({ type: "SET_TABLE", payload: newTable });
      } catch (e) {
        setTable({ type: "SET_TABLE", payload: [] });
        console.error(e);
      }
    })();
  }, [bnf, algorithm]);

  const [linterStore, sendLinter] = useReducer(linterReducer, {
    // reservedWords: [...kinds, "ROOT"],
    ruleList: bootRules,
  });

  return (
    <div>
      <h1>プログラミング言語処理系 LR(0)法 構文解析 支援サイト</h1>

      <h3>使用するアルゴリズムを選択してください</h3>
      <div>
        {/* ラジオボタン   */}
        <label>
          <input type="radio" value="LR0" checked={algorithm === "LR0"} onChange={() => setAlgorithm("LR0")} />
          LR(0)法
        </label>
        <label>
          <input type="radio" value="LR1" checked={algorithm === "LR1"} onChange={() => setAlgorithm("LR1")} />
          LR(1)法
        </label>
      </div>
      <PredictionTextarea
        text={bnf}
        handler={setBnf}
        candidates={(() => {
          //lex(program)の 結果を取得し、kindの重複を除いた配列を作成
          // ただし、1文字のものは除外する
          return handlerReservedWords().filter((k) => k !== "S" && k.length > 1);
        })()}
      />
      <h3>現在の構文解析予約語一覧</h3>
      <p>{handlerReservedWords().join(" ")}</p>
      <h4>上記に加えて、以下のワードも終端記号として認識されます。</h4>
      <p
        style={{
          fontSize: 10,
        }}
      >
        {getTsSyntaxKindList().join(" ")}
      </p>
      {/* <p>ε : 空集合記号（コピーして使ってください）</p> */}
      <div>
        {/* エラーをそれぞれpタグで囲って表示 */}
        {handlerRawBNFWarning().map((e, i) => (
          <p key={i} style={{ color: e.isError ? "red" : "orange" }}>
            (行: {e.line}) {e.error}
          </p>
        ))}
      </div>
      <div>
        <ReactFlowProvider>
          <AutomatonGraph terminals={handlerTerminal()} lrItemSets={handlerLRItemSets()} />
        </ReactFlowProvider>
      </div>
      <LRTable table={table} lightUpState={null} lightUpToken={null}></LRTable>
      <p>コンフリクトが発生しているセルは赤色で表示されます。</p>
      {/* コンフリクト発生個所を表示 */}
      <div>
        <ViewConflict table={table} />
      </div>

      <h2>構文解析したいプログラムを入力してください（TypeScript処理系準拠）</h2>
      <Textarea text={program} handler={setProgram} />
      <div>
        {
          //{lex(program)}を表示
          (() => {
            const tokens = lex(program);
            return <pre>{JSON.stringify(tokens, null, 2)}</pre>;
          })()
        }
      </div>
      {getTreesComponent()}
      <LinterExercise
        onUpsertRule={(rule) => sendLinter({ type: "LINT_RULE_UPSERT", payload: rule })}
        onToggleRule={(id, enabled) => sendLinter({ type: "LINT_RULE_TOGGLE", id, enabled })}
        onRemoveRule={(id) => sendLinter({ type: "LINT_RULE_REMOVE", id })}
        rules={linterStore.ruleList}
        symbolCandidates={["ROOT", ...kinds]}
        tree={((): ParseTreeNode => {
          // getTrees()の最後の要素を取得する。ただし、stringの場合はその前のstring以外になるまで遡る
          const trees = getTrees();

          for (let i = trees.length - 1; i >= 0; i--) {
            if (typeof trees[i] !== "string") {
              return (trees[i] as ParseLog).tree;
            }
          }
          return { symbol: "Error", children: [] };
        })()}
      />
    </div>
  );
};
export default MainPage;
