import { BNF, BNFSet, BNFConcatenation, BNFElement, BNFError } from "./interface/bnf";

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

  lines.forEach((line, index) => {
    if (line === "") return; // 空行は無視
    const [left, right] = line.split("->").map((part) => part.trim());
    if (!left || !right) {
      throw new Error(`${index}\n無効な構文定義 行: ` + line);
    }
    if (left == "ε") {
      throw new Error(`${index}\nεは左辺に使えません。` + line);
    }
    const bnf = new BNF();

    bnf.setLeft(left);
    bnf.setLine(index);

    const rightParts = right.split("|").map((part) => part.trim());
    rightParts.forEach((part, partIndex) => {
      if (part.includes("ε") && part.trim() !== "ε") {
        throw new Error(`${index}\n右辺にεを含める場合は単独で使ってください: ` + part);
      }

      const name = `${index}-${partIndex}`; // 1-1のような形 1は行数目、 Aは左から何個目か

      const concatenation = new BNFConcatenation(left, name);

      // ワイルドカードの処理
      // 例: A* -> A, A+ -> A, A? -> A
      const symbols = part.split(/\s+/).map((sym) => sym.trim());

      symbols.forEach((sym) => {
        const element = new BNFElement();

        if (sym.includes("ε") && sym !== "ε") {
          throw new Error("無効なεが含まれた右辺式: " + sym);
        }

        // εなら空集合
        if (sym === "ε") {
          element.setType("terminal");
          element.setValue(""); // εは空集合を表す
        }

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

export const getTerminalSymbols = (bnfSet: BNFSet): Set<string> => {
  const terminals = new Set<string>();
  bnfSet.getBNFs().forEach((bnf) => {
    bnf.getRight().forEach((concat) => {
      concat.getElements().forEach((elem) => {
        if (elem.getType() === "terminal") {
          terminals.add(elem.getValue());
        }
      });
    });
  });
  return terminals;
};

// 名前のbnfを受け取って、構文にミス（存在しない非終端記号）などがあれば、行数を含む警告を投げる
export const getRawBNFWarningThrows = (bhf: string): BNFError => {
  const warnings: BNFError = [];
  const bnfSet = (() => {
    try {
      return parseRawBnf(bhf);
    } catch (e) {
      warnings.push({
        error: (e as Error).message.split("\n")[1],
        line: (e as Error).message.split("\n")[0] ? parseInt((e as Error).message.split("\n")[0]) : 0,
        isError: true,
      });
      return new BNFSet();
    }
  })();
  const nonTerminals = new Set<string>();
  const terminals = new Set<string>();
  const nonTerminalsLeftLine = new Map<string, number>(); // 非終端記号が左辺に現れた行数

  bnfSet.getBNFs().forEach((bnf) => {
    // 非終端記号を収集
    nonTerminalsLeftLine.set(bnf.getLeft(), bnf.getLine());
    bnf.getRight().forEach((concat) => {
      concat.getElements().forEach((elem) => {
        if (elem.getType() === "terminal") {
          terminals.add(elem.getValue());
        } else {
          nonTerminals.add(elem.getValue());
        }
      });
    });
  });

  // 存在しない非終端記号を探す
  const definedNonTerminals = new Set<string>();
  bnfSet.getBNFs().forEach((bnf) => {
    definedNonTerminals.add(bnf.getLeft());
  });

  bnfSet.getBNFs().forEach((bnf, index) => {
    bnf.getRight().forEach((concat) => {
      concat.getElements().forEach((elem) => {
        // 大文字以外なら、終端記号の意図として使っているならば、シングルクオーテーションで囲むべき
        if (elem.getType() === "nonterminal" && /[^A-Z_]/.test(elem.getValue()) && !terminals.has(elem.getValue()) && elem.getValue() !== "ε") {
          warnings.push({
            error: `非終端記号 '${elem.getValue()}' は大文字とアンダースコアのみで構成されるべきです。終端記号として使用する場合はシングルクオーテーションで囲んでください。`,
            line: index, // 行数は0始まりにする
            isError: true,
          });
        } else if (elem.getType() === "nonterminal" && elem.getValue() === "") {
          warnings.push({
            error: `非終端記号が空であることを表現したい場合は'ε'を使用してください。`,
            line: index,
            isError: true,
          });
        }
        // 定義されていない非終端記号を使用している
        else if (elem.getType() === "nonterminal" && !definedNonTerminals.has(elem.getValue()) && elem.getValue() !== "ε") {
          warnings.push({
            error: `未定義の非終端記号 '${elem.getValue()}' が使用されています。`,
            line: index, // 行数は0始まりにする
            isError: true,
          });
        }
      });
    });
  });

  // 使用していない非終端記号を探す
  definedNonTerminals.forEach((nt) => {
    if (nt === "S") {
      // Sは常に使用されるべき
      return;
    }

    if (!nonTerminals.has(nt)) {
      warnings.push({
        error: `未使用の非終端記号 '${nt}' があります。`,
        line: nonTerminalsLeftLine.get(nt) || -1,
        isError: false,
      });
    }
  });

  // 1行目はSから始まるべき
  if (bnfSet.getBNFs().length > 0 && bnfSet.getBNFs()[0].getLeft() !== "S") {
    warnings.push({
      error: "最初の構文定義は'S'から始まる必要があります。",
      line: 0,
      isError: true,
    });
  }

  return warnings;
};
