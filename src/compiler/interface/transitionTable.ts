import { BNFConcatenation, BNFSet } from "./bnf";
export type TransitionTableRow = {
  state: number; // 状態番号
  actions: { [terminal: string]: Action }; // 終端記号に対するアクション
  gotos: { [nonTerminal: string]: number }; // 非終端記号に対する遷移先状態
};

export type Action = ShiftAction | ReduceAction | AcceptAction | ConflictAction;

export interface ShiftAction {
  type: "shift";
  toState: number;
}

export interface ReduceAction {
  type: "reduce";
  by: BNFConcatenation; // どの生成規則でリダクションするか
}
export interface ConflictAction {
  type: "conflict";
  list: Array<BNFConcatenation | number | null>; // どの生成規則でリダクションするか
}

export interface AcceptAction {
  type: "accept";
}

export type TransitionTable = TransitionTableRow[];
