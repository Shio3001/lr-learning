// LTItemsから状態遷移表を作る

import { BNFSet, BNFConcatenation } from "./interface/bnf";
import { LRItemSet } from "./interface/lr0ItemSet";
import { LR1ItemSet } from "./interface/lr1ItemSet";
import { LRItem } from "./interface/lrItem";
import { TransitionTable, TransitionTableRow, ConflictAction } from "./interface/transitionTable";

// 開始記号はS もしくはS`があればS`
const getStartSymbol = (bnfSet: BNFSet): string => {
  if (bnfSet.hasNonTerminal("S`")) return "S`";
  if (bnfSet.hasNonTerminal("S")) return "S";
  throw new Error("BNF定義が空です。");
};

// LRItemSetの配列から状態遷移表を作成する
export const makeTransitionTable = (lrItemSets: LRItemSet[], bnfSet: BNFSet): TransitionTable => {
  const startSymbol = getStartSymbol(bnfSet);
  const table: TransitionTable = [];

  lrItemSets.forEach((itemSet, stateIndex) => {
    const row: TransitionTableRow = {
      state: stateIndex,
      actions: {},
      gotos: {},
    };

    // 書き換える場所と、新たに発生した遷移を渡すので、rowを書き換える（引数のactionは型の問題からそのまま使ってはならない）
    const replaceConflict = (action: { type: "shift" | "reduce"; by: BNFConcatenation | number }, terminal: string) => {
      if (row.actions[terminal] && row.actions[terminal].type !== "accept") {
        // すでに同じアクションが存在する場合、コンフリクト
        console.warn(`状態${stateIndex}でアクションのコンフリクトが発生しました。`, row.actions[terminal], action);
        //conflictActionに書き換える
        const existing = row.actions[terminal];
        if (existing.type === "conflict") {
          // すでにconflictActionなら、byに追加する
          if (action.type === "shift") {
            existing.list.push(action.by as number);
          } else if (action.type === "reduce") {
            existing.list.push(action.by as BNFConcatenation);
          }
        } else {
          // まだconflictActionでなければ、conflictActionに書き換える
          const list: Array<BNFConcatenation | number | null> = [];
          if (existing.type === "shift") {
            list.push(existing.toState);
          } else if (existing.type === "reduce") {
            list.push(existing.by);
          }
          if (action.type === "shift") {
            list.push(action.by as number);
          } else if (action.type === "reduce") {
            list.push(action.by as BNFConcatenation);
          }
          row.actions[terminal] = { type: "conflict", list };
        }
        return true;
      }
      return false;
    };

    itemSet.getItems().forEach((item) => {
      const dotNext = item.getDotNextElement();
      if (dotNext) {
        // ドットの次が存在する場合、遷移がある
        const nextState = lrItemSets.findIndex((s) => {
          return s.hasItem(item.advance());
        });
        if (nextState === -1) {
          throw new Error("次の状態が見つかりません。");
        }

        if (dotNext.isTerminal()) {
          // 終端記号ならactionに追加

          if (row.actions[dotNext.getValue()]) {
            // すでに同じアクションが存在する場合、コンフリクト
            // throw new Error(`状態${stateIndex}でアクションのコンフリクトが発生しました。`);
            console.warn(`状態${stateIndex}でアクションのコンフリクトが発生しました。`, row.actions[dotNext.getValue()], {
              type: "shift",
              toState: nextState,
            });
            //conflictActionに書き換える
            replaceConflict({ type: "shift", by: nextState }, dotNext.getValue());

            return;
          }

          row.actions[dotNext.getValue()] = { type: "shift", toState: nextState };
        } else {
          // 非終端記号ならgotoに追加
          row.gotos[dotNext.getValue()] = nextState;
        }
      } else {
        // ドットの次が存在しない場合、リダクションまたはアクセプト
        const left = item.getConcatenation().getLeft();
        if (left === startSymbol) {
          // 開始記号ならアクセプト
          console.log(`状態${stateIndex}でアクセプトアクションを設定`);
          row.actions["$"] = { type: "accept" }; // $は入力の終端を表す特別な記号
        } else {
          // それ以外はリダクション
          // すでに同じアクションが存在する場合、コンフリクト
          if (row.actions["$"] && row.actions["$"].type !== "accept") {
            // throw new Error(`状態${stateIndex}でアクションのコンフリクトが発生しました。`);
            console.warn(`状態${stateIndex}でアクションのコンフリクトが発生しました。`, row.actions["$"], {
              type: "reduce",
              by: item.getConcatenation(),
            });
            replaceConflict({ type: "reduce", by: item.getConcatenation() }, "$");

            return;
          }

          /**
           * アイテム集合 i が A → w • という形式のアイテムを含み、対応する文法規則 A → w の番号 m が m > 0 なら、状態 i に対応するアクション表の行には全て reduce アクション rm を書き込む。
           */
          bnfSet.getAllTerminals().forEach((terminal) => {
            if (row.actions[terminal] && row.actions[terminal].type !== "accept") {
              // throw new Error(`状態${stateIndex}でアクションのコンフリクトが発生しました。`);
              console.warn(`状態${stateIndex}でアクションのコンフリクトが発生しました。`, row.actions[terminal], {
                type: "reduce",
                by: item.getConcatenation(),
              });
              replaceConflict({ type: "reduce", by: item.getConcatenation() }, terminal);

              return;
            }
            row.actions[terminal] = { type: "reduce", by: item.getConcatenation() };
          });

          // S->. なら $ にもリダクションを追加
          if (!row.actions["$"]) {
            row.actions["$"] = { type: "reduce", by: item.getConcatenation() };
          }
          console.log(`状態${stateIndex}でリダクションアクションを設定: ${left} -> ${item.getConcatenation().getRight().join(" ")}`);
        }
      }
    });

    table.push(row);
  });

  return table;
};

// 使い方の例
// const transitionTable = makeTransitionTable(lrItemSets, bnfSet);
// console.log(transitionTable);
// console.log(JSON.stringify(transitionTable, null, 2));
