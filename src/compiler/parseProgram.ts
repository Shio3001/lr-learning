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
      // throw new Error(`状態${currentState}に対応するテーブル行が存在しません。`);
      logs.push(`状態${currentState}に対応するテーブル行が存在しません。`);
      break;
    }

    const action = tableRow.actions[currentToken.type];
    if (!action) {
      // throw new Error(`状態${currentState}でトークン'${currentToken.type}'に対するアクションが存在しません。`);
      logs.push(`状態${currentState}でトークン'${currentToken.type}'に対するアクションが存在しません。`);
      break;
    }

    if (action.type === "shift") {
      // シフトアクション
      stack.push(action.toState);
      symbolStack.push({ symbol: currentToken.type, children: [] });
      logs.push({
        tree: { symbol: "ROOT", children: [...symbolStack] },
        state: currentState,
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

      const currentState = stack[stack.length - 1];
      const gotoState = table[currentState].gotos[action.by.getLeft()];
      if (gotoState === undefined) {
        // throw new Error(`状態${currentState}で非終端記号'${action.by.getLeft()}'に対する遷移が存在しません。`);
        logs.push(`状態${currentState}で非終端記号'${action.by.getLeft()}'に対する遷移が存在しません。`);
        break;
      }
      stack.push(gotoState);
      logs.push({
        tree: { symbol: "ROOT", children: [...symbolStack] },
        state: currentState,
        token: action.by.getLeft(),
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
      // throw new Error(`未知のアクションタイプです。`);
      logs.push(`未知のアクションタイプです。`);
      break;
    }
  }

  if (symbolStack.length !== 1) {
    console.warn("構文解析木のルートノードが一つではありません。", symbolStack);
    // 新たにルートノードを作成
    const rootNode: ParseTreeNode = { symbol: "ROOT", children: [...symbolStack] };

    //ParseLogならばlogs[logs.length - 1] = { tree: rootNode, state: logs[logs.length - 1].state, token: logs[logs.length - 1].token };、stringならそのままにする
    if (logs.length > 0 && typeof logs[logs.length - 1] !== "string") {
      const lastLog = logs[logs.length - 1] as ParseLog;
      logs[logs.length - 1] = { tree: rootNode, state: lastLog.state, token: lastLog.token };
    }
    return { log: logs };
  }

  console.log("構文解析成功", logs);

  return { log: logs };
};
