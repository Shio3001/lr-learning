import { BNF, BNFSet, BNFConcatenation, BNFElement } from "./Interface/bnf";
/**
 *  S -> A B C D
 *  A -> 'a' | 'A' 'a'
 *  B -> 'b'
 *  C -> 'c' ?
 *  D -> 'd' *
 *  E -> 'e' +
 *
 * 上記のようなBNFをパースしてデータ構造に変換する
 *
 * 1. 行ごとに分割
 * 2. 各行を "->" で分割して左辺と右辺に分ける
 * 3. 右辺を空白で分割して各シンボルを取得
 * 4. 各シンボルをさらに解析して、終端記号、非終端記号、オプション、繰り返しなどを判別
 * 5. データ構造に格納
 *
 * データ構造の例:
 * {
 *   "S": [["A", "B", "C", "D"]],
 *   "A": [["'a'"], ["A", "'a'"]],
 *   "B": [["'b'"]],
 *   "C": [["'c'", "?"]],
 *   "D": [["'d'", "*"]],
 *   "E": [["'e'", "+"]],
 * }
 * */

export const parseRawBnf = (bnf: string): BNFSet => {
  const lines = bnf.split("\n").map((line) => line.trim());
  const bnfSet = new BNFSet();
  bnfSet.bnfs = [];

  lines.forEach((line) => {
    if (line === "") return; // 空行は無視
    const [left, right] = line.split("->").map((part) => part.trim());
    if (!left || !right) {
      throw new Error(`Invalid BNF line: ${line}`);
    }

    const bnf = new BNF();
    bnf.left = left;
    bnf.right = [];

    const rightParts = right.split("|").map((part) => part.trim());
    rightParts.forEach((part) => {
      const symbols = part.split(/\s+/).map((sym) => sym.trim());
      const concatenation = new BNFConcatenation();
      concatenation.elements = [];

      symbols.forEach((sym) => {
        const element = new BNFElement();
        if (sym.startsWith("'") && sym.endsWith("'")) {
          element.type = "terminal";
          element.value = sym.slice(1, -1);
        } else if (sym.endsWith("?")) {
          element.type = "nonterminal";
          element.value = sym.slice(0, -1);
          // オプションは後で処理
        } else if (sym.endsWith("*")) {
          element.type = "nonterminal";
          element.value = sym.slice(0, -1);
          // 繰り返しは後で処理
        } else if (sym.endsWith("+")) {
          element.type = "nonterminal";
          element.value = sym.slice(0, -1);
          // 1回以上の繰り返しは後で処理
        } else {
          element.type = "nonterminal";
          element.value = sym;
        }
        concatenation.elements.push(element);
      });
      bnf.right.push(concatenation);
    });
    bnfSet.bnfs.push(bnf);
  });
  return bnfSet;
};

// 名前のbnfを受け取って、構文にミス（存在しない非終端記号）などがあれば、行数を含む警告を投げる
export const getRawBNFWarningThrows = (
  bhf: string
): Array<{
  error: string;
  line: number;
}> => {
  const warnings: Array<{
    error: string;
    line: number;
  }> = [];
  const bnfSet = parseRawBnf(bhf);
  const nonTerminals = new Set<string>();
  const terminals = new Set<string>();

  // すべての非終端記号を収集
  bnfSet.bnfs.forEach((bnf) => {
    nonTerminals.add(bnf.left);
    bnf.right.forEach((concatenation) => {
      concatenation.elements.forEach((element) => {
        if (element.type === "terminal") {
          terminals.add(element.value);
        } else {
          nonTerminals.add(element.value);
        }
      });
    });
  });

  // 各行をチェックして、存在しない非終端記号を探す
  const lines = bhf.split("\n").map((line) => line.trim());
  lines.forEach((line, index) => {
    if (line === "") return; // 空行は無視
    const [left, right] = line.split("->").map((part) => part.trim());
    if (!left || !right) {
      warnings.push({
        error: `Invalid BNF line: ${line}`,
        line: index + 1,
      });
      return;
    }

    const rightParts = right.split("|").map((part) => part.trim());
    rightParts.forEach((part) => {
      const symbols = part.split(/\s+/).map((sym) => sym.trim());
      symbols.forEach((sym) => {
        let symbolName = sym;
        if (sym.startsWith("'") && sym.endsWith("'  ")) {
          // 終端記号は無視
          return;
        }
        if (sym.endsWith("?") || sym.endsWith("*") || sym.endsWith("+")) {
          symbolName = sym.slice(0, -1);
        }
        if (!nonTerminals.has(symbolName)) {
          warnings.push({
            error: `Undefined non-terminal symbol: ${symbolName}`,
            line: index + 1,
          });
        }
      });
    });
  });

  return warnings;
};
