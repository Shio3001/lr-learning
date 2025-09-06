import { BNFSet, BNFConcatenation, BNFElement } from "./bnf";
import { FirstSet } from "./firstSet";
import { LRItem } from "./lrItem";
import { encryptSha256 } from "../../helper/hash.js";

/** FIRST(βa) を非再帰・逐次で計算するユーティリティ */
function computeFirstSeqBetaA(beta: BNFElement[], a: string, firstSet: FirstSet, epsilonSymbol: string): Set<string> {
  const out = new Set<string>();

  // β が空 → a を追加
  if (!beta || beta.length === 0) {
    if (a) out.add(a);
    return out;
  }

  for (let i = 0; i < beta.length; i++) {
    const el = beta[i];
    if (!el) break;

    if (el.getType() === "terminal") {
      // 先頭が終端ならそれだけで確定
      const v = el.getValue();
      if (v) out.add(v);
      return out;
    }

    // 非終端: 事前計算済み FIRST を参照
    const f = firstSet[el.getValue()];
    if (!f || f.size === 0) {
      // 未定義/空なら安全側で打ち切り
      return out;
    }

    // ε 以外を追加
    for (const s of f) if (s !== epsilonSymbol) out.add(s);

    // ε を含まなければここで終了
    if (!f.has(epsilonSymbol)) return out;
    // ε を含むなら次の要素へ継続
  }

  // β 全体が ε を導く → a を追加
  if (a) out.add(a);
  return out;
}

/** —————————————— LR(1) アイテム集合 —————————————— */
export class LR1ItemSet {
  private lrItems: LRItem[] = [];
  private goto: Map<string, number> = new Map();
  private readonly seeds: LRItem[];

  constructor(initItems: LRItem[]) {
    this.seeds = initItems;
    initItems.forEach((it) => this.addItem(it));
  }

  /** core（規則＋ドット位置）のキー。LRItem.getHash() は lookahead を含まない想定 */
  private coreKey(item: LRItem): string {
    return item.getHash();
  }
  /** 完全キー（core + lookahead） */
  private fullKey(item: LRItem): string {
    return `${item.getHash()}|LA:${item.getLookahead()}`;
  }

  getHash(): string {
    return encryptSha256(
      this.lrItems
        .map((it) => this.coreKey(it))
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
    const k = this.fullKey(item);
    return this.lrItems.some((i) => this.fullKey(i) === k);
  }

  /** 同一(core, lookahead) が無ければ追加（LR(1)なので lookahead 別アイテムは共存） */
  addItem(item: LRItem) {
    if (!this.hasItem(item)) this.lrItems.push(item);
  }

  addGoto(symbol: string, itemSetIndex: number) {
    this.goto.set(symbol, itemSetIndex);
  }
  replaceGoto(prevItemSetIndex: number, newItemSetIndex: number) {
    this.goto.forEach((v, k) => {
      if (v === prevItemSetIndex) this.goto.set(k, newItemSetIndex);
    });
  }
  getGoto(symbol: string): number | undefined {
    return this.goto.get(symbol);
  }
  getGotos(): Map<string, number> {
    return this.goto;
  }

  /**
   * LR(1) closure（非再帰）
   * - [A→α・Bβ, a] があれば、FIRST(βa) を lookahead にして B→・γ を追加
   * - 返り値: 記号 -> advance 済みアイテム配列（遷移候補の「核」）
   */
  closure(grammar: BNFSet, firstSet: FirstSet, epsilonSymbol: string): { [symbol: string]: LRItem[] } {
    const rv: { [symbol: string]: LRItem[] } = {};

    const pushRv = (sym: string, item: LRItem) => {
      if (!rv[sym]) rv[sym] = [];
      const k = this.fullKey(item);
      if (!rv[sym].some((x) => this.fullKey(x) === k)) rv[sym].push(item);
    };

    // すでに持っているアイテム集合を基点に拡張する
    const q: LRItem[] = [...this.seeds];
    const seen = new Set<string>(this.lrItems.map((i) => this.fullKey(i)));

    while (q.length > 0) {
      const cur = q.shift()!;
      const nextEl = cur.getDotNextElement();
      if (!nextEl) continue;

      if (nextEl.getType() === "nonterminal") {
        // β = 次の非終端のさらに次から
        const concat = cur.getConcatenation();
        const beta: BNFElement[] = concat.getElements().slice(cur.getDotPosition() + 1);

        // FIRST(βa)
        const laSet = computeFirstSeqBetaA(beta, cur.getLookahead(), firstSet, epsilonSymbol);

        // B の各生成規則に対し lookahead ごとに初期アイテムを追加
        const prods = grammar.getBNFbyLeft(nextEl.getValue());
        for (const prod of prods) {
          for (const la of laSet) {
            const seed = new LRItem(prod, 0, la);
            const k = this.fullKey(seed);
            if (!seen.has(k)) {
              seen.add(k);
              this.addItem(seed);
              q.push(seed);
            }
          }
        }
      }

      // 遷移候補（advance）収集（lookahead は引き継がれる）
      const advanced = cur.advance();
      pushRv(nextEl.getValue(), advanced);
    }

    return rv;
  }
}

/** —————————————— LR(1) アイテム集合族 —————————————— */
export class LR1ItemSets {
  private itemSets: LR1ItemSet[] = [];

  constructor(private readonly grammar: BNFSet, private readonly firstSet: FirstSet, private readonly epsilonSymbol: string = "ε") {}

  /**
   * LR(1) の集合計算開始
   * @param startLookahead デフォルトは "$"（入力終端）
   */
  startCalculation(startLookahead: string = "$") {
    // 1) 開始記号（S` があれば優先）
    const startLeft = this.grammar.hasNonTerminal("S`") ? "S`" : "S";

    // 2) その左辺の規則を 1 つ取得（S'->S があるならそれ、無ければ S の最初の規則）
    const prods: BNFConcatenation[] = this.grammar.getBNFbyLeft(startLeft);
    if (!prods || prods.length === 0) {
      throw new Error(`開始記号 ${startLeft} の生成規則が見つかりません。`);
    }
    const startConcat = prods[0];

    // 3) 先読み $ を付けて I0 を作る
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

  // 集合の比較キー（順序安定化 + lookahead を含む）
  private fullKey(item: LRItem): string {
    return `${item.getHash()}|LA:${item.getLookahead()}`;
  }
  private itemsKey(items: LRItem[]): string {
    return items
      .map((i) => this.fullKey(i))
      .sort()
      .join(",");
  }

  /** closure/goto をキューで回す（非再帰） */
  private calcClosure(startItem: LRItem) {
    const que: Array<{ idx: number }> = [];
    // 「遷移核（advance したアイテム集合）」→ state index のインターン
    const nodeHash = new Map<string, number>();

    const startSet = new LR1ItemSet([startItem]);
    const startIdx = this.addItemSet(startSet);
    que.push({ idx: startIdx });

    while (que.length > 0) {
      const { idx } = que.shift()!;
      const curSet = this.itemSets[idx];

      // 自身を閉包しながら、記号→advance アイテム群（＝次状態の核）を得る
      const nextMap = curSet.closure(this.grammar, this.firstSet, this.epsilonSymbol);

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
