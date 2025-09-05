import { BNFConcatenation, BNFElement } from "./bnf";

export class LRItem {
  constructor(protected readonly concatenation: BNFConcatenation, private readonly dotPosition: number = 0, private readonly lookahead: string = "") {}

  // ドットを進めるメソッド
  advance() {
    return new LRItem(this.concatenation, this.dotPosition + 1, this.lookahead);
  }

  // ドットの位置を取得
  getDotPosition() {
    return this.dotPosition;
  }

  getDotNextElement() {
    return this.concatenation.getElementAt(this.dotPosition);
  }

  getHash(): string {
    return `${this.concatenation.getHash()}|${this.dotPosition}`;
  }

  getConcatenation(): BNFConcatenation {
    return this.concatenation;
  }

  getLookahead(): string {
    return this.lookahead;
  }
}
