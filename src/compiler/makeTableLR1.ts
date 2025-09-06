// LTItemsから状態遷移表を作る（LR(1)対応・記号ごとグルーピング・冪等/衝突整理）

import { BNFSet, BNFConcatenation } from "./interface/bnf";
import { LRItemSet } from "./interface/lr0ItemSet";
import { LR1ItemSet } from "./interface/lr1ItemSet";
import { LRItem } from "./interface/lrItem";
import { TransitionTable, TransitionTableRow } from "./interface/transitionTable";
import { eqConcat } from "../helper/table";

/** 開始記号は S` があれば S`、なければ S */
const getStartSymbol = (bnfSet: BNFSet): string => {
  if (bnfSet.hasNonTerminal("S`")) return "S`";
  if (bnfSet.hasNonTerminal("S")) return "S";
  throw new Error("BNF定義が空です。");
};

/** 状態 s が advanced の「コア（規則＋ドット位置）」を含むか */
const hasCoreItem = (s: any, advanced: LRItem): boolean => {
  const items: LRItem[] = s.getItems?.() ?? [];
  const advHash = advanced.getConcatenation()?.getHash?.();
  const advDot = advanced.getDotPosition?.();
  return items.some((it: any) => {
    const sameRule = it.getConcatenation?.().getHash?.() === advHash;
    const sameDot = it.getDotPosition?.() === advDot;
    return sameRule && sameDot;
  });
};

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
  return new Set<string>(); // LR(0) 相当 → reduce ではスキップ
};

/** 同一値を重複追加しない push */
const conflictPushUnique = (list: Array<number | BNFConcatenation | null>, v: number | BNFConcatenation) => {
  const has = list.some((x) =>
    typeof x === "number" && typeof v === "number" ? x === v : typeof x !== "number" && typeof v !== "number" ? eqConcat(x, v) : false
  );
  if (!has) list.push(v);
};

/** 記号ごとにまとめた advanced コア集合をすべて含む唯一の goto 先状態を特定する */
const findGotoStateForGroup = (allSets: Array<LR1ItemSet | LRItemSet>, groupAdvanced: LRItem[]): number => {
  const candidates: number[] = [];

  for (let i = 0; i < allSets.length; i++) {
    const s = allSets[i];
    const ok = groupAdvanced.every((adv) => hasCoreItem(s, adv));
    if (ok) candidates.push(i);
  }

  if (candidates.length === 1) return candidates[0];

  if (candidates.length === 0) {
    throw new Error("goto 先状態が見つかりません（カーネル一致なし）");
  }

  // 同じカーネルの重複状態が存在する可能性。最小 index を採用し警告。
  console.warn("同一カーネルの状態が複数見つかりました。最小 index を採用します:", candidates);
  return Math.min(...candidates);
};

/** 既存アクションにぶつかったら conflict にまとめる（同一内容は無視） */
const replaceConflict = (row: TransitionTableRow, terminal: string, incoming: { type: "shift" | "reduce"; by: number | BNFConcatenation }) => {
  const ex = row.actions[terminal];
  if (!ex || ex.type === "accept") return;

  if (ex.type === "shift" && incoming.type === "shift" && ex.toState === incoming.by) return;
  if (ex.type === "reduce" && incoming.type === "reduce" && eqConcat(ex.by, incoming.by as BNFConcatenation)) return;

  if (ex.type === "conflict") {
    conflictPushUnique(ex.list, incoming.by as any);
    return;
  }

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
// isLoose = true の場合、競合先がsihftのみなら何もせず、握りつぶす
const setReduce = (row: TransitionTableRow, terminal: string, by: BNFConcatenation, isLoose: boolean = false) => {
  const ex = row.actions[terminal];
  if (!ex) {
    row.actions[terminal] = { type: "reduce", by };
    return;
  }
  if (isLoose && ex.type === "shift") return; // SHIFT優先モードなら握りつぶす
  if (ex.type === "reduce" && eqConcat(ex.by, by)) return;
  replaceConflict(row, terminal, { type: "reduce", by });
};

/** 記号キー（終端/非終端を区別） */
const symKey = (isTerm: boolean, v: string) => (isTerm ? `T|${v}` : `N|${v}`);
const parseSymKey = (k: string): { isTerm: boolean; v: string } => {
  const [kind, ...rest] = k.split("|");
  return { isTerm: kind === "T", v: rest.join("|") };
};

/** LR(1)：アイテム集合配列から状態遷移表を作成 */
export const makeTransitionTableLR1 = (lrItemSets: LR1ItemSet[], bnfSet: BNFSet, isLoose: boolean = false): TransitionTable => {
  const startSymbol = getStartSymbol(bnfSet);
  const table: TransitionTable = [];

  lrItemSets.forEach((itemSet, stateIndex) => {
    const row: TransitionTableRow = { state: stateIndex, actions: {}, gotos: {} };

    // 1) 記号ごとに「ドットの右がその記号」のアイテムをグルーピング
    const groups = new Map<string, LRItem[]>();
    itemSet.getItems().forEach((item: LRItem) => {
      const nxt = item.getDotNextElement();
      if (!nxt) return; // reduce/accept は後段で処理
      const key = symKey(nxt.isTerminal(), nxt.getValue());
      const arr = groups.get(key);
      if (arr) arr.push(item);
      else groups.set(key, [item]);
    });

    // 2) 各グループについて、一意の goto 先状態を決めて一回だけ setShift / goto
    groups.forEach((items, key) => {
      const { isTerm, v } = parseSymKey(key);
      const advanced = items.map((it) => it.advance());

      // まず構築済みの goto を利用（存在しない場合のみ総当たり）
      let nextState = (itemSet as any).getGoto?.(v);
      if (nextState == null) {
        nextState = findGotoStateForGroup(lrItemSets as Array<LR1ItemSet | LRItemSet>, advanced);
      }

      if (isTerm) {
        setShift(row, v, nextState);
      } else {
        if (row.gotos[v] == null) row.gotos[v] = nextState;
        else if (row.gotos[v] !== nextState) {
          console.warn(`goto 競合: ${v} in state ${stateIndex}`, row.gotos[v], nextState);
        }
      }
    });

    // 3) reduce / accept（ドットが末尾）
    itemSet.getItems().forEach((item: LRItem) => {
      const nxt = item.getDotNextElement();
      if (nxt) return; // 末尾でないなら上で処理済み

      const left = item.getConcatenation().getLeft();

      // 受理（S' -> S .）: $ のみに accept
      if (left === startSymbol) {
        row.actions["$"] = { type: "accept" };
        return;
      }

      const lookaheads = getLookaheadSet(item);
      if (lookaheads.size === 0) {
        console.warn(`状態${stateIndex}：lookahead 空集合での reduce はスキップ`, item);
        return;
      }

      const reduceBy = item.getConcatenation();
      lookaheads.forEach((t) => setReduce(row, t, reduceBy, isLoose));
    });

    table.push(row);
  });

  return table;
};
