// TransitionTableをもとに、解析するプログラム

import { TransitionTable } from "./interface/transitionTable";
import { ParseTreeNode, ParseLog, ParseLogs } from "./interface/tree";
import { Token } from "./tsLexerLib";
// tsLexerLibで字句解析したトークンToken[]をもとに、構文解析を行う
// 解析過程のログ , その中に構文解析木を含む
export const parseProgram = (
  program: Token[],
  table: TransitionTable
): {
  log: ParseLogs;
} => {
  const stack: number[] = [0]; // 状態スタック
  const symbolStack: ParseTreeNode[] = []; // 記号スタック
  const logs: ParseLogs = []; // 解析過程のログ

  let index = 0; // 現在のトークンのインデックス

  while (true) {
    const currentState = stack[stack.length - 1];
    const currentToken =
      index < program.length
        ? {
            type: program[index].kind,
            value: program[index].text,
          }
        : { type: "$", value: "$" }; // 入力の終端を表す特別なトークン

    const tableRow = table[currentState];
    if (!tableRow) {
      throw new Error(`状態${currentState}に対応するテーブル行が存在しません。`);
    }

    const action = tableRow.actions[currentToken.type];
    if (!action) {
      throw new Error(`状態${currentState}でトークン'${currentToken.type}'に対するアクションが存在しません。`);
    }

    if (action.type === "shift") {
      // シ   フトアクション
      stack.push(action.toState);
      symbolStack.push({ symbol: currentToken.type, children: [] });
      logs.push({
        tree: { symbol: "ROOT", children: [...symbolStack] },
        state: action.toState,
        token: currentToken.type,
      });
      index++;
    } else if (action.type === "reduce") {
      // リダクションアクション
      const right = action.by.getRight();
      const children: ParseTreeNode[] = [];
      for (let i = 0; i < right.length; i++) {
        stack.pop();
        const child = symbolStack.pop();
        if (child) {
          children.unshift(child);
        } else {
          throw new Error("記号スタックが空です。");
        }
      }
      const newNode: ParseTreeNode = { symbol: action.by.getLeft(), children };
      symbolStack.push(newNode);

      const gotoState = table[stack[stack.length - 1]].gotos[action.by.getLeft()];
      if (gotoState === undefined) {
        throw new Error(`状態${stack[stack.length - 1]}で非終端記号'${action.by.getLeft()}'に対する遷移が存在しません。`);
      }
      stack.push(gotoState);
      logs.push({
        tree: { symbol: "ROOT", children: [...symbolStack] },
        state: gotoState,
        token: currentToken.type,
      });
    } else if (action.type === "accept") {
      // アクセプトアクション
      logs.push({
        tree: { symbol: "ROOT", children: [...symbolStack] },
        state: currentState,
        token: currentToken.type,
      });
      break;
    } else {
      throw new Error(`未知のアクションタイプです。`);
    }
  }

  if (symbolStack.length !== 1) {
    throw new Error("構文解析木のルートノードが一つではありません。");
  }

  return { log: logs };
};
