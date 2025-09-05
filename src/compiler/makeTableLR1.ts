// src/compiler/makeTableLR1.ts

import { BNFSet, BNFConcatenation } from "./interface/bnf";
import { LR1ItemSet } from "./interface/lr1ItemSet";

// 型だけの import にして未使用警告を回避
import type { TransitionTable, TransitionTableRow } from "./interface/transitionTable";

// 開始記号はS もしくはS`があればS`
const getStartSymbol = (bnfSet: BNFSet): string => {
  if (bnfSet.hasNonTerminal("S`")) return "S`";
  if (bnfSet.hasNonTerminal("S")) return "S";
  throw new Error("BNF定義が空です。");
};

// LR(1) 用：LTItems から状態遷移表を作る（先読みつき）
export const makeTransitionTableLR1 = (lrItemSets: LR1ItemSet[], bnfSet: BNFSet): TransitionTable => {
  const startSymbol = getStartSymbol(bnfSet);
  const table: TransitionTable = [];

  lrItemSets.forEach((itemSet, stateIndex) => {
    const row: TransitionTableRow = {
      state: stateIndex,
      actions: {},
      gotos: {},
    };

    // 既存の action と衝突したら conflict に畳み込む
    const replaceConflict = (action: { type: "shift" | "reduce"; by: number | BNFConcatenation }, terminal: string) => {
      if (row.actions[terminal] && row.actions[terminal].type !== "accept") {
        console.warn(`状態${stateIndex}でアクションのコンフリクトが発生しました。`, row.actions[terminal], action);

        const existing = row.actions[terminal];
        if (existing.type === "conflict") {
          if (action.type === "shift") existing.list.push(action.by as number);
          else existing.list.push(action.by as BNFConcatenation);
        } else {
          const list: Array<BNFConcatenation | number | null> = [];
          if (existing.type === "shift") list.push(existing.toState);
          else if (existing.type === "reduce") list.push(existing.by);
          if (action.type === "shift") list.push(action.by as number);
          else list.push(action.by as BNFConcatenation);
          row.actions[terminal] = { type: "conflict", list };
        }
        return true;
      }
      return false;
    };

    itemSet.getItems().forEach((item) => {
      const dotNext = item.getDotNextElement();

      if (dotNext) {
        // shift/goto
        const nextState = lrItemSets.findIndex((s) => s.hasItem(item.advance()));
        if (nextState === -1) throw new Error("次の状態が見つかりません。");

        if (dotNext.isTerminal()) {
          const t = dotNext.getValue();
          if (row.actions[t]) {
            replaceConflict({ type: "shift", by: nextState }, t);
          } else {
            row.actions[t] = { type: "shift", toState: nextState };
          }
        } else {
          row.gotos[dotNext.getValue()] = nextState;
        }
        return;
      }

      // reduce / accept（★ LR(1) は lookahead ごと）
      const left = item.getConcatenation().getLeft();
      const la = item.getLookahead(); // 先読み

      if (left === startSymbol && la === "$") {
        row.actions["$"] = { type: "accept" };
        return;
      }

      const targetTerm = la || "$";
      const reduceAction: { type: "reduce"; by: BNFConcatenation } = {
        type: "reduce",
        by: item.getConcatenation(),
      };

      if (row.actions[targetTerm] && row.actions[targetTerm].type !== "accept") {
        replaceConflict(reduceAction, targetTerm);
      } else {
        row.actions[targetTerm] = reduceAction;
      }
    });

    table.push(row);
  });

  return table;
};
