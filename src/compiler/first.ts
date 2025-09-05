// BNFSetからFirst集合を計算する
import { BNFSet, BNFConcatenation, BNFElement } from "./interface/bnf";
import { FirstSet } from "./interface/firstSet";
// First集合を計算する関数
export const first = (bnfSet: BNFSet): FirstSet => {
  const firstSet: FirstSet = {}; // First集合を格納するオブジェクト
  const nullable: Set<string> = new Set(); // εを導出できる非終端記号の集合

  // 初期化: 各記号のFirst集合を空集合で初期化
  const initializeFirstSet = () => {
    for (const bnf of bnfSet.getBNFs()) {
      const left = bnf.getLeft();
      if (!(left in firstSet)) {
        firstSet[left] = new Set();
      }
      for (const right of bnf.getRight()) {
        for (const element of right.getElements()) {
          const symbol = element.getValue();
          if (!(symbol in firstSet)) {
            firstSet[symbol] = new Set();
          }
        }
      }
      // 終端記号のFirst集合はそれ自身
      for (const terminal of bnfSet.getTerminals()) {
        if (!(terminal in firstSet)) {
          firstSet[terminal] = new Set([terminal]);
        }
      }
    }
  };

  // 反復的にFirst集合を計算
  const computeFirstSet = () => {
    let changed = true;
    while (changed) {
      changed = false;
      for (const bnf of bnfSet.getBNFs()) {
        const left = bnf.getLeft();
        for (const right of bnf.getRight()) {
          let canBeNullable = true; // 右辺がすべてnullableかどうか
          for (const symbol of right.getElements().map((e) => e.getValue())) {
            // symbolが終端記号ならば、それをFirst集合に追加して終了
            if (bnfSet.hasNonTerminal(symbol) === false) {
              if (!firstSet[left].has(symbol)) {
                firstSet[left].add(symbol);
                changed = true;
              }
              canBeNullable = false;
              break;
            } else {
              // symbolが非終端記号ならば、そのFirst集合をleftのFirst集合に追加
              const beforeSize = firstSet[left].size;
              for (const sym of firstSet[symbol]) {
                if (sym !== "ε") {
                  // εはここでは追加しない
                  firstSet[left].add(sym);
                }
              }
              if (firstSet[left].size > beforeSize) {
                changed = true;
              }
              // symbolがnullableでなければ、これ以上進めない
              if (!nullable.has(symbol)) {
                canBeNullable = false;
                break;
              }
            }
          }
          // 右辺がすべてnullableならば、leftもnullable
          if (canBeNullable) {
            if (!nullable.has(left)) {
              nullable.add(left);
              changed = true;
            }
          }
        }
      }
    }
  };

  initializeFirstSet();
  computeFirstSet();

  // nullableな非終端記号に対してεをFirst集合に追加
  for (const sym of nullable) {
    firstSet[sym].add("ε");
  }

  return firstSet;
};

// ある記号列のFirst集合を計算する関数
export const firstOfSymbols = (symbols: BNFElement[], lookahead: string, firstSet: FirstSet): string[] => {
  const result: Set<string> = new Set();
  let canBeNullable = true;

  for (const symbol of symbols) {
    const symValue = symbol.getValue();
    if (firstSet[symValue]) {
      for (const sym of firstSet[symValue]) {
        if (sym !== "ε") {
          result.add(sym);
        }
      }
    }
  }

  return Array.from(result);
};
