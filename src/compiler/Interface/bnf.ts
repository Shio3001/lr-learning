export class BNFElement {
  type: "terminal" | "nonterminal";
  value: string;

  constructor() {
    this.type = "nonterminal";
    this.value = "";
  }

  setType(t: "terminal" | "nonterminal") {
    this.type = t;
  }

  setValue(v: string) {
    this.value = v;
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
