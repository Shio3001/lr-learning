// LTItemsから状態遷移表を作る（LR(1)対応・冪等/衝突整理済み）

import { BNFSet, BNFConcatenation } from "./interface/bnf";
import { LRItemSet } from "./interface/lr0ItemSet";
import { LR1ItemSet } from "./interface/lr1ItemSet";
import { LRItem } from "./interface/lrItem";
import { TransitionTable, TransitionTableRow } from "./interface/transitionTable";

/** 開始記号は S` があれば S`、なければ S */
const getStartSymbol = (bnfSet: BNFSet): string => {
  if (bnfSet.hasNonTerminal("S`")) return "S`";
  if (bnfSet.hasNonTerminal("S")) return "S";
  throw new Error("BNF定義が空です。");
};

/** 規則同値判定（equals があれば使い、無ければ toString でフォールバック） */
const eqConcat = (a: any, b: any) => a === b || a?.equals?.(b) || a?.toString?.() === b?.toString?.();

/** LR(1) の lookahead を Set<string> で取得（実装差を吸収） */
const getLookaheadSet = (item: LRItem): Set<string> => {
  const anyItem = item as any;

  if (typeof anyItem.getLookaheads === "function") {
    const la = anyItem.getLookaheads();
    if (la instanceof Set) return la as Set<string>;
    if (Array.isArray(la)) return new Set<string>(la as string[]);
  }
  if (typeof anyItem.getLookahead === "function") {
    const one = anyItem.getLookahead();
    if (one == null) return new Set<string>();
    return new Set<string>([String(one)]);
  }

  // LR(0) 相当（ここでは reduce 先を決められないので空集合にしてスキップさせる）
  return new Set<string>();
};

/** 同一値を重複追加しない push */
const conflictPushUnique = (list: Array<number | BNFConcatenation | null>, v: number | BNFConcatenation) => {
  const has = list.some((x) =>
    typeof x === "number" && typeof v === "number" ? x === v : typeof x !== "number" && typeof v !== "number" ? eqConcat(x, v) : false
  );
  if (!has) list.push(v);
};

/** 次状態を探す：hasItem が lookahead 比較を含む実装でも拾えるよう core 一致でフォールバック */
const findNextStateIndex = (sets: Array<LR1ItemSet | LRItemSet>, advanced: LRItem): number => {
  // まずはそのまま
  const idx = (sets as any[]).findIndex((s) => s.hasItem?.(advanced));
  if (idx !== -1) return idx;

  // hasCoreItem があれば使う
  const idx2 = (sets as any[]).findIndex((s) => typeof s.hasCoreItem === "function" && s.hasCoreItem(advanced));
  if (idx2 !== -1) return idx2;

  // 最後の手段：規則＋ドット位置で一致検索
  return (sets as any[]).findIndex((s) => {
    const items: LRItem[] = s.getItems?.() ?? [];
    return items.some((it: any) => {
      const sameRule =
        it.getConcatenation?.().equals?.(advanced.getConcatenation?.()) ?? it.getConcatenation?.().toString?.() === advanced.getConcatenation?.().toString?.();
      const sameDot = it.getDotPosition?.() === advanced.getDotPosition?.();
      return sameRule && sameDot;
    });
  });
};

/** 既存アクションにぶつかったら conflict にまとめる（同一内容は無視して冪等化） */
const replaceConflict = (row: TransitionTableRow, terminal: string, incoming: { type: "shift" | "reduce"; by: number | BNFConcatenation }) => {
  const ex = row.actions[terminal];
  if (!ex || ex.type === "accept") return;

  // 既存と incoming が完全同一なら何もしない
  if (ex.type === "shift" && incoming.type === "shift" && ex.toState === incoming.by) return;
  if (ex.type === "reduce" && incoming.type === "reduce" && eqConcat(ex.by, incoming.by as BNFConcatenation)) return;

  if (ex.type === "conflict") {
    conflictPushUnique(ex.list, incoming.by as any);
    return;
  }

  // ex が shift/reduce のとき conflict に昇格
  const list: Array<number | BNFConcatenation | null> = [];
  if (ex.type === "shift") list.push(ex.toState);
  if (ex.type === "reduce") list.push(ex.by);
  conflictPushUnique(list, incoming.by as any);
  row.actions[terminal] = { type: "conflict", list };
};

/** 冪等な shift 設定 */
const setShift = (row: TransitionTableRow, terminal: string, to: number) => {
  const ex = row.actions[terminal];
  if (!ex) {
    row.actions[terminal] = { type: "shift", toState: to };
    return;
  }
  if (ex.type === "shift" && ex.toState === to) return;
  replaceConflict(row, terminal, { type: "shift", by: to });
};

/** 冪等な reduce 設定 */
const setReduce = (row: TransitionTableRow, terminal: string, by: BNFConcatenation) => {
  const ex = row.actions[terminal];
  if (!ex) {
    row.actions[terminal] = { type: "reduce", by };
    return;
  }
  if (ex.type === "reduce" && eqConcat(ex.by, by)) return;
  replaceConflict(row, terminal, { type: "reduce", by });
};

/** LR(1) 用：アイテム集合配列から状態遷移表を作成 */
export const makeTransitionTableLR1 = (lrItemSets: LR1ItemSet[], bnfSet: BNFSet): TransitionTable => {
  const startSymbol = getStartSymbol(bnfSet);
  const table: TransitionTable = [];

  lrItemSets.forEach((itemSet, stateIndex) => {
    const row: TransitionTableRow = {
      state: stateIndex,
      actions: {},
      gotos: {},
    };

    itemSet.getItems().forEach((item: LRItem) => {
      const dotNext = item.getDotNextElement();

      if (dotNext) {
        // ---- shift / goto ----
        const nextState = findNextStateIndex(lrItemSets as Array<LR1ItemSet | LRItemSet>, item.advance());
        if (nextState === -1) {
          throw new Error("次の状態が見つかりません。");
        }

        if (dotNext.isTerminal()) {
          setShift(row, dotNext.getValue(), nextState);
        } else {
          const nt = dotNext.getValue();
          if (row.gotos[nt] == null) row.gotos[nt] = nextState;
          else if (row.gotos[nt] !== nextState) {
            console.warn(`goto 競合: ${nt} in state ${stateIndex}`, row.gotos[nt], nextState);
          }
        }
        return;
      }

      // ---- reduce / accept ----
      const left = item.getConcatenation().getLeft();

      // 受理（S' -> S .）: $ のみに accept を立てる
      if (left === startSymbol) {
        if (row.actions["$"] && row.actions["$"].type !== "accept") {
          console.warn(`状態${stateIndex}: $ に非 accept アクションが存在 → 上書きで accept`);
        }
        row.actions["$"] = { type: "accept" };
        return;
      }

      // LR(1) の reduce：各アイテムの lookahead にだけ書く
      const lookaheads = getLookaheadSet(item);
      if (lookaheads.size === 0) {
        // 構成上の不整合（LR(0) 相当）なので警告してスキップ
        console.warn(`状態${stateIndex}：lookahead 空集合での reduce はスキップ`, item);
        return;
      }

      const reduceBy = item.getConcatenation();
      lookaheads.forEach((t) => setReduce(row, t, reduceBy));
    });

    table.push(row);
  });

  return table;
};
