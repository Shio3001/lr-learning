export class BNFElement {
  type: "terminal" | "nonterminal";
  value: string;
  wildcard: string;

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
}

export class BNFConcatenation {
  elements: BNFElement[];

  constructor() {
    this.elements = [];
  }

  addElement(e: BNFElement) {
    this.elements.push(e);
  }
}

export class BNF {
  left: string;
  right: BNFConcatenation[];
  line: number = 0; // このBNFが定義されている行数（0始まり）

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
}

export class BNFSet {
  bnfs: BNF[];

  constructor() {
    this.bnfs = [];
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
