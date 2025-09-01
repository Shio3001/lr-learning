export class BNFElement {
  private type: "terminal" | "nonterminal";
  private value: string;
  private wildcard: string;

  constructor() {
    this.type = "nonterminal";
    this.value = "";
    this.wildcard = "";
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
}

export class BNFConcatenation {
  private elements: BNFElement[];

  constructor() {
    this.elements = [];
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
}

export type BNFError = Array<{
  error: string;
  line: number; // 0始まり、bnfの行数
  isError?: boolean;
}>;
