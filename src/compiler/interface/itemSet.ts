import { LRItem } from "./lrItem";
import { BNFSet, BNFConcatenation, BNFElement } from "./bnf";
import { encryptSha256 } from "../../helper/hash.js";
export class LRItemSet {
  //最終的なLRオートマトン集合の、ノードの状態を表す成果物
  private lrItems: LRItem[];

  // 遷移先
  private goto: Map<string, number>;

  // このclassにitemを渡す時点で、item.advance()を実行していること！展開の基準となります
  constructor(private readonly item: LRItem) {
    this.lrItems = [];
    this.goto = new Map<string, number>();
    this.addItem(this.item);
  }

  //lrItemsをもとに、この集合の1つのハッシュ値を生成する
  getHash(): string {
    return encryptSha256(this.lrItems.map((item) => item.getHash()).join("|"));
  }

  /**
   * このアイテム集合内でのクロージャーの計算をする
   * このクラスの債務が肥大化しないよう、この中では再帰計算を行わない
   * そのため、次のノードに渡すべきdotを含んだLRItemを返却する。この過程では、Advanceを行っておく。
   * このメソッドは、そのItemSet単体で動作する
   * @param item コアとなるLRItem
   * @returns 次には制すべきLRItemの集合（keyは遷移すべき状態名）
   */
  closure(BNFSet: BNFSet): { [name: string]: LRItem } {
    const nextElement = this.item.getDotNextElement();

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
        rvItems[this.item.getDotNextElement().getValue()] = this.item.advance();
      } else {
        // 終端記号なら、そのまま追加
        this.addItem(this.item);
      }
    }

    console.log("クロージャ計算", this.item, rvItems);
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

  constructor(private readonly BNFSet: BNFSet) {
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

    const currentItemSet = new LRItemSet(item);

    que.push({
      currentItemSetIndex: this.addItemSet(currentItemSet),
      currentItem: item,
    });

    // nodehash hash:nodeindex
    const nodeHash: Map<string, number> = new Map();

    while (que.length > 0) {
      const front = que.shift();
      // タイプガード
      if (front === undefined) {
        continue;
      }

      const { currentItemSetIndex } = front;
      const nextItems = this.itemSets[currentItemSetIndex].closure(this.BNFSet);

      for (const [nextState, nItem] of Object.entries(nextItems)) {
        const nextItemSetIndex = this.addItemSet(new LRItemSet(nItem));
        que.push({
          currentItemSetIndex: nextItemSetIndex,
          currentItem: nItem,
        });

        // 状態遷移を紐づける
        this.itemSets[currentItemSetIndex].addGoto(nextState, nextItemSetIndex);
      }
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
