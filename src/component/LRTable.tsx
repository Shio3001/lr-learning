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
  const getActionKeys = () => {
    const actionSet = new Set<string>();
    table.forEach((row) => {
      Object.keys(row.actions).forEach((action) => actionSet.add(action));
    });
    return Array.from(actionSet);
  };
  const getGotosKeys = () => {
    const gotoSet = new Set<string>();
    table.forEach((row) => {
      Object.keys(row.gotos).forEach((goto) => gotoSet.add(goto));
    });
    return Array.from(gotoSet);
  };

  return (
    <table border={1} style={{ borderCollapse: "collapse", marginTop: "20px" }}>
      <thead>
        <tr>
          <th>State</th>
          <th colSpan={getActionKeys().length}>Actions</th>
          <th colSpan={getGotosKeys().length}>Gotos</th>
        </tr>
        <tr>
          <th></th>
          {getActionKeys().map((terminal) => (
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
          {getGotosKeys().map((nonTerminal) => (
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
            {getActionKeys().map((terminal) => (
              <td
                key={`action-${row.state}-${terminal}`}
                style={{
                  backgroundColor: (() => {
                    if (lightUpState === row.state && lightUpToken === terminal) return "yellow";
                    if (row.actions[terminal]?.type === "conflict") return "red";
                    return "transparent";
                  })(),
                }}
              >
                {/* {row.actions[terminal]
                  ? row.actions[terminal].type === "shift"
                    ? `S${row.actions[terminal].toState}`
                    : row.actions[terminal].type === "reduce"
                    ? // conflict時
                      `R(${row.actions[terminal].by.getAsString()})`
                    : "ACC"
                  : ""} */}
                {(() => {
                  const action = row.actions[terminal];
                  if (!action) return "";
                  if (action.type === "shift") {
                    return `S${action.toState}`;
                  } else if (action.type === "reduce") {
                    return `R(${action.by.getAsString()})`;
                  } else if (action.type === "accept") {
                    return "ACC";
                  } else if (action.type === "conflict") {
                    return `C(${action.list.map((by) => (by === null ? "シフト" : typeof by === "number" ? `S${by}` : `R(${by.getAsString()})`)).join(", ")})`;
                  }
                  return "";
                })()}
              </td>
            ))}
            {getGotosKeys().map((nonTerminal) => (
              <td
                style={{
                  backgroundColor: (() => {
                    if (lightUpState === row.state && lightUpToken === nonTerminal) return "yellow";
                    // if (row.gotos[nonTerminal]?.type === "conflict") return "red";
                    return "transparent";
                  })(),
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
