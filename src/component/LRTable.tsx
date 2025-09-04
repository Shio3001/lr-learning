//TransitionTableが渡されるので、それを可視化する

import React from "react";
import { TransitionTable } from "../compiler/interface/transitionTable";
import { makeTransitionTable } from "../compiler/makeTable";
import { LRItemSet } from "../compiler/interface/itemSet";
import { BNFSet } from "../compiler/interface/bnf";

type LRTableProps = {
  // TransitionTable
  table: TransitionTable;

  // 解析結果を表示するときに、わかりやすくするために背景を変える場所
  lightUpState: number | null;
  lightUpToken: string | null;
};

const LRTable: React.FC<LRTableProps> = ({ table, lightUpState, lightUpToken }) => {
  return (
    <table border={1} style={{ borderCollapse: "collapse", marginTop: "20px" }}>
      <thead>
        <tr>
          <th>State</th>
          <th colSpan={Object.keys(table[0]?.actions || {}).length}>Actions</th>
          <th colSpan={Object.keys(table[0]?.gotos || {}).length}>Gotos</th>
        </tr>
        <tr>
          <th></th>
          {Object.keys(table[0]?.actions || {}).map((terminal) => (
            <th
              style={{
                paddingLeft: "5px",
                paddingRight: "5px",
              }}
              key={`action-${terminal}`}
            >
              {terminal}
            </th>
          ))}
          {Object.keys(table[0]?.gotos || {}).map((nonTerminal) => (
            <th
              style={{
                paddingLeft: "5px",
                paddingRight: "5px",
              }}
              key={`goto-${nonTerminal}`}
            >
              {nonTerminal}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {table.map((row) => (
          <tr key={`row-${row.state}`}>
            <td>{row.state}</td>
            {Object.keys(table[0]?.actions || {}).map((terminal) => (
              <td
                key={`action-${row.state}-${terminal}`}
                style={{
                  backgroundColor: lightUpState === row.state && lightUpToken === terminal ? "yellow" : "transparent",
                }}
              >
                {row.actions[terminal]
                  ? row.actions[terminal].type === "shift"
                    ? `S${row.actions[terminal].toState}`
                    : row.actions[terminal].type === "reduce"
                    ? `R(${row.actions[terminal].by.getLeft()}->${row.actions[terminal].by.getRight().join(" ")})`
                    : "ACC"
                  : ""}
              </td>
            ))}
            {Object.keys(table[0]?.gotos || {}).map((nonTerminal) => (
              <td
                style={{
                  backgroundColor: lightUpState === row.state && lightUpToken === nonTerminal ? "yellow" : "transparent",
                }}
                key={`goto-${row.state}-${nonTerminal}`}
              >
                {row.gotos[nonTerminal] !== undefined ? row.gotos[nonTerminal] : ""}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
};

export default LRTable;
