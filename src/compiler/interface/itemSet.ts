import { LRItem } from "./lrItem";
import { BNFSet, BNFConcatenation, BNFElement } from "./bnf";

export class LRItemSet {
  private lrItems: LRItem[];

  // 遷移先
  private goto: Map<string, number>;

  // このclassにitemを渡す時点で、item.advance()を実行していること！
  constructor() {
    this.lrItems = [];
    this.goto = new Map<string, number>();
  }

  /**
   * このアイテム集合内でのクロージャーの計算をする
   * このクラスの債務が肥大化しないよう、この中では再帰計算を行わない
   * そのため、次のノードに渡すべきdotを含んだLRItemを返却する。この過程では、Advanceを行っておく。
   * @param item
   */
  closure(BNFSet: BNFSet, item: LRItem): { [name: string]: LRItem } {
    const nextElement = item.getDotNextElement();

    //ここでのname/keyは遷移すべきstateを表現する
    const rvItems: { [name: string]: LRItem } = {};

    if (nextElement) {
      // 次の要素が存在する場合の処理

      // 非終端記号なら、クロージャを計算する
      if (nextElement.getType() === "nonterminal") {
        // クロージャを計算する処理
        BNFSet.getBNFbyLeft(nextElement.getValue()).forEach((concat) => {
          const newItem = new LRItem(concat);
          this.addItem(newItem);
          rvItems[newItem.getDotNextElement().getValue()] = newItem.advance();
        });
        rvItems[item.getDotNextElement().getValue()] = item.advance();
      } else {
        // 終端記号なら、そのまま追加
        this.addItem(item);
      }
    }

    console.log("クロージャ計算", item, rvItems);
    return rvItems;
  }

  addItem(item: LRItem) {
    this.lrItems.push(item);
  }

  addGoto(state: string, itemSetIndex: number) {
    this.goto.set(state, itemSetIndex);
  }

  getGoto(state: string): number | undefined {
    return this.goto.get(state);
  }

  getGotos(): Map<string, number> {
    return this.goto;
  }
}
export class LRItemSets {
  private itemSets: LRItemSet[];

  constructor(private BNFSet: BNFSet) {
    this.itemSets = [];
  }

  startCalculation() {
    this.calcClosure(new LRItem(this.BNFSet.getStartSymbol()));
    return this.itemSets;
  }

  calcClosure(item: LRItem) {
    const que: Array<{
      currentItemSetIndex: number; // 計算元のItemSetのindex
      currentItem: LRItem; //展開するべきItem(dotは進めている)
    }> = [];

    const currentItemSet = new LRItemSet();
    que.push({
      currentItemSetIndex: this.addItemSet(currentItemSet),
      currentItem: item,
    });

    while (que.length > 0) {
      const front = que.shift();
      // タイプガード
      if (front === undefined) {
        continue;
      }

      const { currentItemSetIndex, currentItem } = front;
      const nextItems = this.itemSets[currentItemSetIndex].closure(this.BNFSet, currentItem);

      for (const [nextState, nItem] of Object.entries(nextItems)) {
        const nextItemSetIndex = this.addItemSet(new LRItemSet());
        que.push({
          currentItemSetIndex: nextItemSetIndex,
          currentItem: nItem,
        });

        // 状態遷移を紐づける
        this.itemSets[currentItemSetIndex].addGoto(nextState, nextItemSetIndex);
      }

      //   que.push(
      //     ...Object.values(nextItems).map((nextItem) => ({
      //       currentItemSetIndex: this.addItemSet(new LRItemSet()),
      //       currentItem: nextItem,
      //     }))
      //   );

      //   // 状態遷移を紐づける
      //   Object.entries(nextItems).forEach(([nextState, nextItem]) => {
      //     this.itemSets[currentItemSetIndex].addGoto(nextState, nItem);
      //   });
    }
  }

  addItemSet(itemSet: LRItemSet): number {
    this.itemSets.push(itemSet);
    return this.itemSets.length - 1;
  }

  getItemSets() {
    return this.itemSets;
  }
}
