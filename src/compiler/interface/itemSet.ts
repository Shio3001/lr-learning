import { LRItem } from "./lrItem";
import { BNFSet, BNFConcatenation, BNFElement } from "./bnf";
import { encryptSha256 } from "../../helper/hash.js";
export class LRItemSet {
  //最終的なLRオートマトン集合の、ノードの状態を表す成果物
  private lrItems: LRItem[];

  // 遷移先
  private goto: Map<string, number>;

  // このclassにitemを渡す時点で、item.advance()を実行していること！展開の基準となります
  constructor(private readonly initItems: Array<LRItem>) {
    this.lrItems = [];

    this.goto = new Map<string, number>();
    this.initItems.forEach((item) => this.addItem(item));
  }

  //private readonly itemをもとに、この集合の1つのハッシュ値を生成する
  getHash(): string {
    return encryptSha256(this.lrItems.map((item) => item.getHash()).join(","));
  }

  getLRItems(): LRItem[] {
    return this.lrItems;
  }

  /**
   * このアイテム集合内でのクロージャーの計算をする
   * このクラスの債務が肥大化しないよう、この中ではアイテム集合をまたいだ再帰計算を行わない
   * そのため、次のノードに渡すべきdotを含んだLRItemを返却する。この過程では、Advanceを行っておく。
   * このメソッドは、そのItemSet単体で動作する
   * @param item コアとなるLRItem
   * @returns 次には制すべきLRItemの集合（keyは遷移すべき状態名）
   */
  closure(BNFSet: BNFSet): { [name: string]: Array<LRItem> } {
    // const nextElement = this.item.getDotNextElement();
    const nextElements = this.initItems.map((item) => item.getDotNextElement());
    // const nextElementsDotPositions = this.initItems.map((item) => item.getDotPosition());

    //ここでのname/keyは遷移すべきstateを表現する
    const rvItems: { [name: string]: Array<LRItem> } = {};

    const pushRvItems = (name: string, item: LRItem) => {
      if (rvItems[name]) {
        // ここでもhashを使って重複排除したい
        const hashSet = new Set<string>();
        rvItems[name].forEach((existingItem) => {
          hashSet.add(existingItem.getHash());
        });

        if (!hashSet.has(item.getHash())) {
          rvItems[name].push(item);
        }
      } else {
        rvItems[name] = [item];
      }
    };

    if (!nextElements) {
      return {};
    }
    const que = nextElements.map((_, index) => ({
      queNewItem: this.initItems[index], //次に処理するべきLRItem
      // queElement: element, // 次に処理するべき要素のdotの直後の要素
    }));

    // rvItems[this.item.getDotNextElement().getValue()] = [this.item.advance()];

    // nextElements.forEach((element, index) => {
    //   if (element) {
    //     rvItems[element.getValue()] = [this.initItems[index].advance()];
    //   }
    // });

    const hashSet = new Set<string>();

    while (que.length > 0) {
      const currentQue = que.shift();
      if (currentQue === undefined) {
        break;
      }

      const { queNewItem } = currentQue;
      const queElement = queNewItem.getDotNextElement();

      if (queElement) {
        // 次の要素が存在する場合の処理
        // 非終端記号なら、クロージャを計算する
        if (queElement.getType() === "nonterminal") {
          // rvItems[queElement.getValue()] = [queNewItem.advance()];
          pushRvItems(queElement.getValue(), queNewItem.advance());

          // クロージャを計算する処理
          BNFSet.getBNFbyLeft(queElement.getValue()).forEach((concat) => {
            const newItem = new LRItem(concat);

            if (hashSet.has(newItem.getHash())) {
              return;
            }
            hashSet.add(newItem.getHash());
            this.addItem(newItem);

            const dotNext = newItem.getDotNextElement();

            if (rvItems[dotNext.getValue()]) {
              console.warn("LR(0)のクロージャ計算で、同じ遷移先が複数回出現しました", dotNext.getValue(), rvItems[dotNext.getValue()]);
              // rvItems[dotNext.getValue()].push(newItem.advance());
              pushRvItems(dotNext.getValue(), newItem.advance());
              console.log("追加されたアイテム", rvItems[dotNext.getValue()]);
            } else {
              // rvItems[dotNext.getValue()] = [newItem.advance()];
              pushRvItems(dotNext.getValue(), newItem.advance());
            }

            // if (dotNext.getType() === "nonterminal") {
            que.push({
              queNewItem: newItem,
            });
            // }
          });
        } else {
          // 終端記号なら、そのままrvに追加
          pushRvItems(queElement.getValue(), queNewItem.advance());
        }
      }
    }

    console.log("クロージャ計算", this.initItems, rvItems);

    // 変換して渡す
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
      // queItems: Array<LRItem>; //展開するべきItem(dotは進めている)
    }> = [];

    // nodehash hash:nodeindex
    const nodeHash: Map<string, number> = new Map();

    const startItemSet = new LRItemSet([startItem]);

    que.push({
      queItemSetIndex: this.addItemSet(startItemSet),
      // queItems: [startItem],
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

      const nextItemSet = this.itemSets[queItemSetIndex].closure(this.BNFSet);

      for (const [nextState, nItemList] of Object.entries(nextItemSet)) {
        const nItemListHash = (() => {
          return nItemList.map((item) => item.getHash()).join(",");
        })();

        if (nodeHash.has(nItemListHash)) {
          // すでにhashがあった場合、前の状態から現在の状態へ遷移は、すでにある状態へつなげる
          const equalNodeIndex = nodeHash.get(nItemListHash);

          if (equalNodeIndex !== undefined) {
            this.itemSets[queItemSetIndex].addGoto(nextState, equalNodeIndex);
            continue;
          }
        }
        const nItemSet = new LRItemSet(nItemList);
        const nextItemSetIndex = this.addItemSet(nItemSet);
        nodeHash.set(nItemListHash, nextItemSetIndex);

        que.push({
          queItemSetIndex: nextItemSetIndex,
          // queItems: nItemList,
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
