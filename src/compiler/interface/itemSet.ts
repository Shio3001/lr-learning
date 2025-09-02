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

  //private readonly itemをもとに、この集合の1つのハッシュ値を生成する
  getHash(): string {
    return encryptSha256(this.item.getHash());
  }

  /**
   * このアイテム集合内でのクロージャーの計算をする
   * このクラスの債務が肥大化しないよう、この中ではアイテム集合をまたいだ再帰計算を行わない
   * そのため、次のノードに渡すべきdotを含んだLRItemを返却する。この過程では、Advanceを行っておく。
   * このメソッドは、そのItemSet単体で動作する
   * @param item コアとなるLRItem
   * @returns 次には制すべきLRItemの集合（keyは遷移すべき状態名）
   */
  closure(BNFSet: BNFSet): { [name: string]: LRItem } {
    const nextElement = this.item.getDotNextElement();

    //ここでのname/keyは遷移すべきstateを表現する
    const rvItems: { [name: string]: LRItem } = {};

    if (!nextElement) {
      return rvItems;
    }
    const que = [
      {
        queElement: nextElement,
        queDotPosition: this.item.getDotPosition(),
      },
    ];

    rvItems[this.item.getDotNextElement().getValue()] = this.item.advance();

    const hashSet = new Set<string>();

    while (que.length > 0) {
      const currentQue = que.shift();
      if (currentQue === undefined) {
        break;
      }

      const { queElement, queDotPosition } = currentQue;

      if (queElement) {
        if (hashSet.has(queElement.getHashByDot(queDotPosition))) {
          continue;
        }

        hashSet.add(queElement.getHashByDot(queDotPosition));

        // 次の要素が存在する場合の処理
        // 非終端記号なら、クロージャを計算する
        if (queElement.getType() === "nonterminal") {
          // クロージャを計算する処理
          BNFSet.getBNFbyLeft(queElement.getValue()).forEach((concat) => {
            const newItem = new LRItem(concat);
            this.addItem(newItem);

            const dotNext = newItem.getDotNextElement();

            if (rvItems[dotNext.getValue()]) {
              console.warn("LR(0)のクロージャ計算で、同じ遷移先が複数回出現しました", dotNext.getValue());
              rvItems[dotNext.getValue() + "_"] = newItem.advance();
            } else {
              rvItems[dotNext.getValue()] = newItem.advance();
            }

            if (dotNext.getType() === "nonterminal") {
              que.push({
                queElement: dotNext,
                queDotPosition: 0,
              });
            }
          });
        } else {
          // 終端記号なら、そのまま追加
          this.addItem(this.item);
        }
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

  replaceGoto(prevItemSetIndex: number, newItemSetIndex: number) {
    this.goto.forEach((value, key) => {
      if (value === prevItemSetIndex) {
        this.goto.set(key, newItemSetIndex);
      }
    });
  }

  getGoto(state: string): number | undefined {
    return this.goto.get(state);
  }

  getGotos(): Map<string, number> {
    return this.goto;
  }
}
export class LRItemSets {
  private itemSets: Array<LRItemSet>;

  constructor(private readonly BNFSet: BNFSet) {
    this.itemSets = [];
  }

  startCalculation() {
    this.calcClosure(new LRItem(this.BNFSet.getStartSymbol()));
    return this.itemSets;
  }

  calcClosure(startItem: LRItem) {
    const que: Array<{
      queItemSetIndex: number; // 計算元のItemSetのindex
      queItem: LRItem; //展開するべきItem(dotは進めている)
    }> = [];

    // nodehash hash:nodeindex
    const nodeHash: Map<string, number> = new Map();

    const startItemSet = new LRItemSet(startItem);

    que.push({
      queItemSetIndex: this.addItemSet(startItemSet),
      queItem: startItem,
    });

    while (que.length > 0) {
      const front = que.shift();
      // タイプガード
      if (front === undefined) {
        continue;
      }

      const { queItemSetIndex } = front;

      if (this.itemSets[queItemSetIndex] == null) {
        throw new Error("Unexpected null itemSet");
      }

      const nextItems = this.itemSets[queItemSetIndex].closure(this.BNFSet);

      for (const [nextState, nItem] of Object.entries(nextItems)) {
        if (nodeHash.has(nItem.getHash())) {
          // すでにhashがあった場合、前の状態から現在の状態へ遷移は、すでにある状態へつなげる
          const equalNodeIndex = nodeHash.get(nItem.getHash());

          if (equalNodeIndex !== undefined) {
            this.itemSets[queItemSetIndex].addGoto(nextState, equalNodeIndex);
            continue;
          }
        }

        const nextItemSetIndex = this.addItemSet(new LRItemSet(nItem));
        const getHash = nItem.getHash();
        nodeHash.set(getHash, nextItemSetIndex);

        que.push({
          queItemSetIndex: nextItemSetIndex,
          queItem: nItem,
        });

        // 状態遷移を紐づける
        this.itemSets[queItemSetIndex].addGoto(nextState, nextItemSetIndex);
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
