import { BNFConcatenation, BNFElement } from "./bnf";

export class LRItem {
  constructor(private readonly concatenation: BNFConcatenation, private readonly dotPosition: number = 0) {}

  // ドットを進めるメソッド
  advance() {
    return new LRItem(this.concatenation, this.dotPosition + 1);
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
}
