/**
 * LR(0) parser generator
 */

import { BNFSet } from "./interface/bnf";
import { LRItemSets } from "./interface/itemSet";

const lr0 = (bnfSet: BNFSet) => {
  // LR(0) のオートマトンを構築する
  const lrItemSets = new LRItemSets(bnfSet);

  return lrItemSets.startCalculation();
};

export default lr0;
