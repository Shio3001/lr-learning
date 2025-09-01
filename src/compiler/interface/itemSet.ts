import { LRItem } from "./lrItem";

export class LRItemSet {
  constructor(public item: LRItem) {
    const nextElement = item.getDotNextElement();
    if (nextElement) {
      // 次の要素が存在する場合の処理

      // 非終端記号なら、クロージャを計算する
      if (nextElement.getType() === "nonterminal") {
        // クロージャを計算する処理
      }
    }
  }
}
export class LRItemSets {}
