import { BNF, BNFSet, BNFConcatenation, BNFElement } from "./Interface/bnf";

/*
throwしたり、表現するエラーはすべて日本語で
*/

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
      throw new Error("無効なBNF行: " + line);
    }

    const bnf = new BNF();

    bnf.setLeft(left);

    const rightParts = right.split("|").map((part) => part.trim());
    rightParts.forEach((part) => {
      const concatenation = new BNFConcatenation();
      const symbols = part.split(/\s+/).map((sym) => sym.trim());
      symbols.forEach((sym) => {
        const element = new BNFElement();
        if (sym.startsWith("'") && sym.endsWith("'")) {
          // 終端記号
          element.setType("terminal");
          element.setValue(sym.slice(1, -1)); // 'a' -> a
        } else if (sym.endsWith("?")) {
          // オプション
          element.setType("nonterminal");
          element.setValue(sym.slice(0, -1)); // A? -> A
          // オプションは特別な扱いが必要ならここで処理
        } else if (sym.endsWith("*")) {
          // 0回以上の繰り返し
          element.setType("nonterminal");
          element.setValue(sym.slice(0, -1)); // A* -> A
          // 繰り返しは特別な扱いが必要ならここで処理
        } else if (sym.endsWith("+")) {
          // 1回以上の繰り返し
          element.setType("nonterminal");
          element.setValue(sym.slice(0, -1)); // A+ -> A
          // 繰り返しは特別な扱いが必要ならここで処理
        } else {
          // 非終端記号
          element.setType("nonterminal");
          element.setValue(sym);
        }
        concatenation.addElement(element);
      });
      bnf.addRight(concatenation);
    });

    bnfSet.addBNF(bnf);
  });

  return bnfSet;
};

// 名前のbnfを受け取って、構文にミス（存在しない非終端記号）などがあれば、行数を含む警告を投げる
export const getRawBNFWarningThrows = (
  bhf: string
): Array<{
  error: string;
  line: number;
  isError?: boolean;
}> => {
  const warnings: Array<{
    error: string;
    line: number; // 0始まり、bnfの行数
    isError?: boolean;
  }> = [];
  const bnfSet = (() => {
    try {
      return parseRawBnf(bhf);
    } catch (e) {
      warnings.push({
        error: (e as Error).message,
        line: 0,
      });
      return new BNFSet();
    }
  })();
  const nonTerminals = new Set<string>();
  const terminals = new Set<string>();

  bnfSet.bnfs.forEach((bnf) => {
    nonTerminals.add(bnf.left);
    bnf.right.forEach((concat) => {
      concat.elements.forEach((elem) => {
        if (elem.type === "terminal") {
          terminals.add(elem.value);
        } else {
          nonTerminals.add(elem.value);
        }
      });
    });
  });

  // 存在しない非終端記号を探す
  const definedNonTerminals = new Set<string>();
  bnfSet.bnfs.forEach((bnf) => {
    definedNonTerminals.add(bnf.left);
  });

  bnfSet.bnfs.forEach((bnf, index) => {
    bnf.right.forEach((concat) => {
      concat.elements.forEach((elem) => {
        // 大文字以外なら、終端記号の意図として使っているならば、シングルクオーテーションで囲むべき
        if (elem.type === "nonterminal" && /[^A-Z_]/.test(elem.value) && !terminals.has(elem.value)) {
          warnings.push({
            error: `非終端記号 '${elem.value}' は大文字とアンダースコアのみで構成されるべきです。終端記号として使用する場合はシングルクオーテーションで囲んでください。`,
            line: index, // 行数は0始まりにする
            isError: true,
          });
        }

        // 定義されていない非終端記号を使用している
        else if (elem.type === "nonterminal" && !definedNonTerminals.has(elem.value)) {
          warnings.push({
            error: `未定義の非終端記号 '${elem.value}' が使用されています。`,
            line: index, // 行数は0始まりにする
            isError: true,
          });
        }
      });
    });
  });

  // 使用していない非終端記号を探す
  definedNonTerminals.forEach((nt) => {
    if (!nonTerminals.has(nt)) {
      warnings.push({
        error: `未使用の非終端記号 '${nt}' があります。`,
        line: 0, // 行数不明
        isError: false,
      });
    }
  });

  // 1行目はSから始まるべき
  if (bnfSet.bnfs.length > 0 && bnfSet.bnfs[0].left !== "S") {
    warnings.push({
      error: "最初のBNFは'S'から始まる必要があります。",
      line: 0,
      isError: true,
    });
  }

  return warnings;
};
