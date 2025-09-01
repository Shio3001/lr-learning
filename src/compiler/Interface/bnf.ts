export class BNFElement {
  type: "terminal" | "nonterminal";
  value: string;
}

export class BNFConcatenation {
  elements: BNFElement[];
}

export class BNF {
  left: string;
  right: BNFConcatenation[];
}

export class BNFSet {
  bnfs: BNF[];
}
