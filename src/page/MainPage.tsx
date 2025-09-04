import Textarea from "../atoms/textarea";
import Button from "../atoms/button";

import { getRawBNFWarningThrows, parseRawBnf, getTerminalSymbols } from "../compiler/parseBnf";
import lr0 from "../compiler/lr0";
import { BNFSet } from "../compiler/interface/bnf";

import { useEffect, useState, useReducer } from "react";
import AutomatonGraph from "../component/AutomatonGraph";

import { ReactFlowProvider } from "@xyflow/react";
import LRDrawAndCheck from "../component/LRDrawAndCheck";

import { makeTransitionTable } from "../compiler/makeTable";
import { TransitionTable } from "../compiler/interface/transitionTable";
import LRTable from "../component/LRTable";

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

  const getBNFset = () => {
    return getRawBNFWarningThrows(bnf).length === 0 ? parseRawBnf(bnf) : new BNFSet();
  };

  const getTerminal = () => {
    return getTerminalSymbols(getBNFset());
  };

  const getLRItemSets = () => {
    return lr0(getBNFset());
  };

  useEffect(() => {
    try {
      const newTable: TransitionTable = makeTransitionTable(getLRItemSets(), getBNFset());
      setTable({ type: "SET_TABLE", payload: newTable });
    } catch (e) {
      setTable({ type: "SET_TABLE", payload: [] });
    }
  }, [bnf]);

  return (
    <div>
      <h1>プログラミング言語処理系 LR(0)法 構文解析 支援サイト</h1>
      <Textarea text={bnf} handler={setBnf} />
      <p>ε : 空集合記号（コピーして使ってください）</p>
      <div>
        {/* エラーをそれぞれpタグで囲って表示 */}
        {getRawBNFWarningThrows(bnf).map((e, i) => (
          <p key={i} style={{ color: e.isError ? "red" : "orange" }}>
            (行: {e.line}) {e.error}
          </p>
        ))}
      </div>
      {/* <Button
        handler={() => {
          const pbnf = getRawBNFWarningThrows(bnf).length === 0 ? parseRawBnf(bnf) : new BNFSet();
          console.log(lr0(pbnf));
        }}
        text="この構文定義で構築を開始する"
      /> */}
      <div>
        <ReactFlowProvider>
          <AutomatonGraph terminals={getTerminal()} lrItemSets={getLRItemSets()} />
        </ReactFlowProvider>
      </div>
      <LRTable table={table}></LRTable>
      <h2>構文解析したいプログラムを入力してください</h2>
      <Textarea text={program} handler={setProgram} />

      <Button handler={() => {}} text="構文解析を実行"></Button>

      {/* <div>
        <LRDrawAndCheck lrItemSets={lr0(getRawBNFWarningThrows(bnf).length === 0 ? parseRawBnf(bnf) : new BNFSet())}></LRDrawAndCheck>
      </div> */}
    </div>
  );
};
export default MainPage;
