import { BNFConcatenation, BNFElement } from "./bnf";

export class LRItem {
  constructor(private concatenation: BNFConcatenation, private dotPosition: number = 0) {}

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
}
