import React from "react";
import { parseProgram } from "../compiler/parseProgram";

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

export default ParseTimeline;
