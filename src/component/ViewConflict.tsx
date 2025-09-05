//LRTableのconflictStateListを表示するコンポーネント 説明書きは日本語で
// 型に注意すること
import React from "react";
import { TransitionTable, ConflictAction } from "../compiler/interface/transitionTable";

interface ViewConflictProps {
  table: TransitionTable;
}

export const ViewConflict: React.FC<ViewConflictProps> = ({ table }) => {
  const conflictStates = table.filter((row) => {
    return Object.values(row.actions).some((action) => action.type === "conflict");
  });

  if (conflictStates.length === 0) {
    return <div>コンフリクトは発生していません。</div>;
  }

  return (
    <div style={{ marginTop: "20px", padding: "10px", border: "1px solid red", backgroundColor: "#ffe6e6" }}>
      <h3 style={{ color: "red" }}>コンフリクトが発生しています！</h3>
      {conflictStates.map((row) => (
        <div key={row.state} style={{ marginBottom: "10px" }}>
          <strong>状態 {row.state}:</strong>
          <ul>
            {Object.entries(row.actions).map(([terminal, action]) => {
              if (action.type === "conflict") {
                const conflictAction = action as ConflictAction;
                return (
                  <li key={terminal}>
                    トークン '{terminal}' に対するアクションがコンフリクトしています:
                    <ul>
                      {conflictAction.list.map((by, index) => (
                        <li key={index}>
                          {by === null
                            ? "シフト"
                            : typeof by === "number"
                            ? `シフト to 状態 ${by}`
                            : `リダクション by ${(() => {
                                if (by === null) return "シフト";
                                if (typeof by === "number") return `シフト to 状態 ${by}`;
                                // return `リダクション by ${by.toString()}`;
                                //typeofで判定する
                                if (by instanceof Array) {
                                  return `リダクション by ${by.map((s) => s.getValue()).join(" ")}`;
                                }
                                const lr = by.getLeftRight();
                                return `${lr.left} → ${lr.right.map((s) => s.getValue()).join(" ")}`;
                              })()}`}
                        </li>
                      ))}
                    </ul>
                  </li>
                );
              }
              return null;
            })}
          </ul>
        </div>
      ))}
      <p>コンフリクトを解消するには、生成規則の見直しや優先順位の設定を検討してください。</p>
    </div>
  );
};
