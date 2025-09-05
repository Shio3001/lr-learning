/**
 * LR(0) parser generator
 */

import { BNFSet } from "./interface/bnf";
import { LR1ItemSets } from "./interface/lr1ItemSet";
import { BNFElement } from "./interface/bnf";
import { LRItem } from "./interface/lrItem";
import { first } from "./first";
const lr1 = (bnfSet: BNFSet) => {
  // LR(1) のオートマトンを構築する
  const f = first(bnfSet);
  console.log("First集合", f);
  //LRItemSetsLR1のインスタンスを生成

  const lrItemSets = new LR1ItemSets(bnfSet, f);
  return lrItemSets.startCalculation();
};

export default lr1;
