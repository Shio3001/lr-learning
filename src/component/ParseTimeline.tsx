import React, { useState } from "react";
import LRTable from "./LRTable";
import TreeView from "./TreeView";

import { ParseLog, ParseLogs } from "../compiler/interface/tree";
import { TransitionTable } from "../compiler/interface/transitionTable";

type ParseTimelineProps = {
  table: TransitionTable;
  trees: ParseLogs | string; // 文字列はエラー
};

const ParseTimeline: React.FC<ParseTimelineProps> = ({ table, trees }) => {
  if (typeof trees === "string") {
    return (
      <div>
        <h2>構文解析木</h2>
        <p style={{ color: "red" }}>{trees}</p>
      </div>
    );
  }

  if (trees.length === 0) {
    return <p>構文解析木はありません。</p>;
  }

  // 各ステップごとの開閉状態を配列で持つ
  const [openStates, setOpenStates] = useState<boolean[]>(Array(trees.length).fill(false));

  const toggleStep = (i: number) => {
    setOpenStates((prev) => prev.map((o, idx) => (idx === i ? !o : o)));
  };

  const setAll = (value: boolean) => {
    setOpenStates(Array(trees.length).fill(value));
  };

  return (
    <div>
      <h2>構文解析木</h2>
      <div style={{ marginBottom: 8 }}>
        <button onClick={() => setAll(true)} style={{ marginRight: 8 }}>
          全部開く
        </button>
        <button onClick={() => setAll(false)}>全部閉じる</button>
      </div>

      {trees.map((log, index) => {
        if (typeof log === "string") {
          return (
            <div key={index}>
              <p style={{ color: "red" }}>{log}</p>
            </div>
          );
        }

        return <ParseStep key={index} index={index} log={log} table={table} open={openStates[index]} onToggle={() => toggleStep(index)} />;
      })}
    </div>
  );
};

type ParseStepProps = {
  index: number;
  log: ParseLog;
  table: TransitionTable;
  open: boolean;
  onToggle: () => void;
};

const ParseStep: React.FC<ParseStepProps> = ({ index, log, table, open, onToggle }) => {
  return (
    <div
      style={{
        border: "1px solid black",
        marginBottom: "10px",
        padding: "10px",
      }}
    >
      <p style={{ cursor: "pointer", userSelect: "none" }} onClick={onToggle}>
        <strong>ステップ {index + 1}:</strong> 状態 {log.state} にてトークン '{log.token}' を処理{" "}
        <span style={{ color: "blue", marginLeft: 8 }}>[{open ? "閉じる" : "開く"}]</span>
      </p>

      {open && (
        <>
          <LRTable table={table} lightUpState={log.state} lightUpToken={log.token} />
          <div style={{ width: "50%" }}>
            <TreeView root={log.tree} />
          </div>
        </>
      )}
    </div>
  );
};

export default ParseTimeline;
