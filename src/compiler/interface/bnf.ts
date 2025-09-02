import { encryptSha256 } from "../../helper/hash.js";

export class BNFElement {
  private type: "terminal" | "nonterminal" | null;
  private value: string;
  private wildcard: string;

  constructor(type: "terminal" | "nonterminal" | null = null, value: string = "", wildcard: string = "") {
    this.type = type;
    this.value = value;
    this.wildcard = wildcard;
  }

  setType(t: "terminal" | "nonterminal") {
    this.type = t;
  }

  setValue(v: string) {
    this.value = v;
  }

  setWildcard(w: string) {
    this.wildcard = w;
  }

  getWildcard() {
    return this.wildcard;
  }

  getType() {
    return this.type;
  }

  getValue() {
    return this.value;
  }

  //typeとvalueをもとに、この要素のハッシュ値を生成する
  getHash(): string {
    return encryptSha256(`${this.type}|${this.value}|${this.wildcard}`);
  }

  getHashByDot(dot: number): string {
    return encryptSha256(`${this.type}|${this.value}|${this.wildcard}|${dot}`);
  }
}

export class BNFConcatenation {
  private left: string;
  private elements: BNFElement[];

  constructor(left: string) {
    this.left = left;
    this.elements = [];
  }

  getHash(): string {
    return encryptSha256(`${this.left}|${this.elements.map((e) => e.getHash()).join(",")}`);
  }

  addElement(e: BNFElement) {
    this.elements.push(e);
  }

  getElements() {
    return this.elements;
  }

  getElementAt(index: number) {
    return this.elements[index];
  }

  getLeft() {
    return this.left;
  }
}

export class BNF {
  private left: string;
  private right: BNFConcatenation[];
  private line: number = 0; // このBNFが定義されている行数（0始まり）

  constructor() {
    this.left = "";
    this.right = [];
  }

  setLeft(l: string) {
    this.left = l;
  }

  addRight(r: BNFConcatenation) {
    this.right.push(r);
  }

  setLine(line: number) {
    this.line = line;
  }

  getLeft() {
    return this.left;
  }

  getRight() {
    return this.right;
  }

  getLine() {
    return this.line;
  }
}

export class BNFSet {
  private bnfs: BNF[];

  constructor() {
    this.bnfs = [];
  }

  getBNFs() {
    return this.bnfs;
  }

  addBNF(b: BNF) {
    this.bnfs.push(b);
  }

  getBNFbyLeft(left: string): BNFConcatenation[] {
    const result: BNFConcatenation[] = [];
    this.bnfs.forEach((bnf) => {
      if (bnf.getLeft() === left) {
        result.push(...bnf.getRight());
      }
    });
    return result;
  }

  getStartSymbol(): BNFConcatenation {
    // Sから始まる右辺の通りが1つであれば、そのBNFConcatenationを返す
    const bc = this.getBNFbyLeft("S");
    if (bc.length === 1) {
      return bc[0];
    }

    // S´ -> Sを追記し、それを返す
    const sDash = "S´";
    const nbc = new BNFConcatenation(sDash);
    nbc.addElement(new BNFElement("nonterminal", "S"));
    const newBNF = new BNF();
    newBNF.setLeft(sDash);
    newBNF.addRight(nbc);
    this.addBNF(newBNF);
    return nbc;
  }
}

export type BNFError = Array<{
  error: string;
  line: number; // 0始まり、bnfの行数
  isError?: boolean;
}>;
