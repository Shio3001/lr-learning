// ===== ここから LR(1) 版 追加（同一ファイル内） =====

// export type FirstSet = { [symbol: string]: Set<string> }; // 記号 -> FIRST集合

import { BNFSet, BNFConcatenation, BNFElement } from "./bnf";
import { FirstSet } from "./firstSet";
import { LRItem } from "./lrItem";
import { encryptSha256 } from "../../helper/hash.js";

/** FIRST(βa) を非再帰・逐次で計算するユーティリティ */
function computeFirstSeqBetaA(beta: BNFElement[], a: string, firstSet: FirstSet, epsilonSymbol: string): Set<string> {
  const out = new Set<string>();

  // β を左から走査
  for (let i = 0; i < beta.length; i++) {
    const el = beta[i];
    if (!el) break;

    if (el.getType() === "terminal") {
      // 端末ならそれで打ち切り
      out.add(el.getValue());
      return out;
    } else {
      // 非終端: 事前計算済み FIRST を参照
      const f = firstSet[el.getValue()];
      if (!f || f.size === 0) {
        // FIRST が未定義なら安全側で打ち切り（何も追加せず終了）
        return out;
      }
      // ε 以外を追加
      for (const s of f) if (s !== epsilonSymbol) out.add(s);

      // ε を含まなければ打ち切り
      if (!f.has(epsilonSymbol)) return out;
      // ε を含むなら次の要素へ継続
    }
  }

  // β 全体が ε を導くなら lookahead a を追加
  if (a) out.add(a);
  return out;
}

/** —————————————— LR(1) アイテム集合 —————————————— */
export class LR1ItemSet {
  private lrItems: LRItem[] = [];
  private goto: Map<string, number> = new Map();

  constructor(private readonly initItems: LRItem[]) {
    initItems.forEach((it) => this.addItem(it));
  }

  private itemKey(item: LRItem): string {
    // 元の LRItem.getHash() は lookahead を含めないので、ここで付与
    return `${item.getHash()}|LA:${item.getLookahead()}`;
  }

  getHash(): string {
    return encryptSha256(
      this.lrItems
        .map((it) => this.itemKey(it))
        .sort()
        .join(",")
    );
  }

  getItems(): LRItem[] {
    return this.lrItems;
  }
  getLRItems(): LRItem[] {
    return this.lrItems;
  }

  hasItem(item: LRItem): boolean {
    const key = this.itemKey(item);
    return this.lrItems.some((i) => this.itemKey(i) === key);
  }

  addItem(item: LRItem) {
    if (!this.hasItem(item)) this.lrItems.push(item);
  }

  addGoto(state: string, itemSetIndex: number) {
    this.goto.set(state, itemSetIndex);
  }

  replaceGoto(prevItemSetIndex: number, newItemSetIndex: number) {
    this.goto.forEach((v, k) => {
      if (v === prevItemSetIndex) this.goto.set(k, newItemSetIndex);
    });
  }

  getGoto(state: string): number | undefined {
    return this.goto.get(state);
  }

  getGotos(): Map<string, number> {
    return this.goto;
  }

  /**
   * LR(1) 版 closure（非再帰）
   * - [A→α・Bβ, a] があれば、FIRST(βa) を lookahead にして B→・γ を追加
   * - 返り値: 記号 -> advance 済みアイテム配列（遷移候補）
   */
  closure(BNFSet: BNFSet, firstSet: FirstSet, epsilonSymbol: string): { [name: string]: LRItem[] } {
    const rv: { [name: string]: LRItem[] } = {};

    const pushRv = (sym: string, item: LRItem) => {
      if (!rv[sym]) rv[sym] = [];
      const k = this.itemKey(item);
      if (!rv[sym].some((x) => this.itemKey(x) === k)) rv[sym].push(item);
    };

    // アイテム展開用キュー
    const q: LRItem[] = [...this.initItems];
    const seen = new Set<string>(this.lrItems.map((i) => this.itemKey(i)));

    while (q.length > 0) {
      const cur = q.shift()!;
      const nextEl = cur.getDotNextElement();
      if (!nextEl) continue;

      if (nextEl.getType() === "nonterminal") {
        // β = ドット直後の非終端のさらに次から
        const concat = cur.getConcatenation();
        // getElements() がある前提（既存コード準拠）
        const beta: BNFElement[] = concat.getElements().slice(cur.getDotPosition() + 1);

        // FIRST(βa)
        const laSet = computeFirstSeqBetaA(beta, cur.getLookahead(), firstSet, epsilonSymbol);

        // B の各生成規則に対し、lookahead ごとに初期アイテムを追加
        const prods = BNFSet.getBNFbyLeft(nextEl.getValue());
        for (let i = 0; i < prods.length; i++) {
          const prod = prods[i];
          for (const la of laSet) {
            const seed = new LRItem(prod, 0, la);
            const key = this.itemKey(seed);
            if (!seen.has(key)) {
              seen.add(key);
              this.addItem(seed);
              q.push(seed);
            }
          }
        }
      }

      // 遷移候補（advance）収集（lookahead は引き継がれている）
      const advanced = cur.advance();
      pushRv(nextEl.getValue(), advanced);
    }

    return rv;
  }
}

/** —————————————— LR(1) アイテム集合族 —————————————— */
export class LR1ItemSets {
  private itemSets: LR1ItemSet[] = [];

  constructor(private readonly BNFSet: BNFSet, private readonly firstSet: FirstSet, private readonly epsilonSymbol: string = "ε") {}

  /**
   * LR(1) の集合計算開始
   * @param startLookahead 既定は "EoF"
   */
  startCalculation(startLookahead: string = "$") {
    // 拡張開始規則 S'→・S を想定：既存の BNFSet.getStartSymbol() が S'→S なら 0 ドットで OK
    const startConcat = this.BNFSet.getStartSymbol();
    const startItem = new LRItem(startConcat, 0, startLookahead);
    this.calcClosure(startItem);
    return this.itemSets;
  }

  getItemSets() {
    return this.itemSets;
  }

  private addItemSet(s: LR1ItemSet): number {
    this.itemSets.push(s);
    return this.itemSets.length - 1;
  }

  // 集合の比較キー（順序安定化 + lookahead 含む）
  private itemKey(item: LRItem): string {
    return `${item.getHash()}|LA:${item.getLookahead()}`;
  }
  private itemsKey(items: LRItem[]): string {
    return items
      .map((i) => this.itemKey(i))
      .sort()
      .join(",");
  }

  /** closure/goto をキューで回す（非再帰） */
  private calcClosure(startItem: LRItem) {
    const que: Array<{ idx: number }> = [];
    const nodeHash = new Map<string, number>(); // 集合キー -> index

    const startSet = new LR1ItemSet([startItem]);
    const startIdx = this.addItemSet(startSet);
    que.push({ idx: startIdx });

    while (que.length > 0) {
      const { idx } = que.shift()!;
      const curSet = this.itemSets[idx];

      const nextMap = curSet.closure(this.BNFSet, this.firstSet, this.epsilonSymbol);

      for (const [sym, nItems] of Object.entries(nextMap)) {
        if (!nItems || nItems.length === 0) continue;

        const key = this.itemsKey(nItems);
        const existed = nodeHash.get(key);
        if (existed != null) {
          curSet.addGoto(sym, existed);
          continue;
        }

        const nSet = new LR1ItemSet(nItems);
        const ni = this.addItemSet(nSet);
        nodeHash.set(key, ni);

        curSet.addGoto(sym, ni);
        que.push({ idx: ni });
      }
    }
  }
}
// ===== ここまで LR(1) 版 追加 =====
