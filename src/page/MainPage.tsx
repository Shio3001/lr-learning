import Textarea from "../atoms/Textarea";
import PredictionTextarea from "../atoms/PredictionTextarea";
import Button from "../atoms/Button";

import { getRawBNFWarningThrows, parseRawBnf, getTerminalSymbols, getLeftSymbols } from "../compiler/parseBnf";
import lr0 from "../compiler/lr0";
import { BNFSet } from "../compiler/interface/bnf";

import { useEffect, useState, useReducer } from "react";
import AutomatonGraph from "../component/AutomatonGraph";

import { ReactFlowProvider } from "@xyflow/react";

import { makeTransitionTable } from "../compiler/makeTable";
import { TransitionTable } from "../compiler/interface/transitionTable";
import LRTable from "../component/LRTable";
import { parseProgram } from "../compiler/parseProgram";
import { Token, lex } from "./../compiler/tsLexerLib";
import TreeView from "../component/TreeView";
import LinterExercise from "../component/LinterExercise";
import { ParseTreeNode, ParseLog } from "../compiler/interface/tree";
import { linterReducer, bootRules } from "../helper/studyLitner";

const MainPage = () => {
  // const [bnf, setBnf] = useState<string>("S->STMT 'EoF'\nSTMT->'Ex' EXP\nEXP->'NUM'");
  const [bnf, setBnf] = useState<string>("S->LIST 'EoF'\nLIST->'LPAR' SEQ 'RPAR' | 'NUM'\nSEQ -> LIST\nSEQ -> SEQ 'COMMA' LIST");
  const [program, setProgram] = useState<string>("");

  //const lrtableを可視化したもの useReducer
  const [table, setTable] = useReducer((state, action) => {
    switch (action.type) {
      case "SET_TABLE":
        return action.payload;
      default:
        return state;
    }
  }, []);
  // const kinds = lex(program).map((t: Token) => t.kind); をuseMemoでメモ化programが変わったときだけ更新
  const [kinds, setKinds] = useState<string[]>([]);

  useEffect(() => {
    const tokens = lex(program);
    const uniqueKinds = Array.from(new Set(tokens.map((t: Token) => t.kind)));
    setKinds(uniqueKinds);
  }, [program]);

  const getReservedWords = () => {
    return [...kinds, "->", ...getLeft(), "|"];
  };

  const getBNFset = () => {
    return getRawBNFWarningThrows(bnf, kinds).length === 0 ? parseRawBnf(bnf, kinds) : new BNFSet();
  };

  const getTerminal = () => {
    return getTerminalSymbols(getBNFset());
  };

  const getLeft = () => {
    return getLeftSymbols(bnf, kinds);
  };

  const getLRItemSets = () => {
    return lr0(getBNFset());
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
    try {
      const newTable: TransitionTable = makeTransitionTable(getLRItemSets(), getBNFset());
      setTable({ type: "SET_TABLE", payload: newTable });
    } catch (e) {
      setTable({ type: "SET_TABLE", payload: [] });
    }
  }, [bnf]);

  const [linterStore, sendLinter] = useReducer(linterReducer, {
    reservedWords: [...getReservedWords().filter((k) => k !== "S" && k.length > 1), "ROOT"],
    ruleList: bootRules,
  });

  return (
    <div>
      <h1>プログラミング言語処理系 LR(0)法 構文解析 支援サイト</h1>
      <PredictionTextarea
        text={bnf}
        handler={setBnf}
        candidates={(() => {
          //lex(program)の 結果を取得し、kindの重複を除いた配列を作成
          // ただし、1文字のものは除外する
          return getReservedWords().filter((k) => k !== "S" && k.length > 1);
        })()}
      />
      <h3>現在の構文解析予約語一覧</h3>
      <p>{getReservedWords().join(" ")}</p>
      {/* <p>ε : 空集合記号（コピーして使ってください）</p> */}
      <div>
        {/* エラーをそれぞれpタグで囲って表示 */}
        {getRawBNFWarningThrows(bnf, kinds).map((e, i) => (
          <p key={i} style={{ color: e.isError ? "red" : "orange" }}>
            (行: {e.line}) {e.error}
          </p>
        ))}
      </div>
      <div>
        <ReactFlowProvider>
          <AutomatonGraph terminals={getTerminal()} lrItemSets={getLRItemSets()} />
        </ReactFlowProvider>
      </div>
      <LRTable table={table} lightUpState={null} lightUpToken={null}></LRTable>
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
        symbolCandidates={kinds}
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
