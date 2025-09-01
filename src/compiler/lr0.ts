/**
 * LR(0) parser generator
 */

import { BNFSet } from "./interface/bnf";

const lr0 = (bnfSet: BNFSet) => {
  // LR(0) のオートマトンを構築する

  return {
    success: true, // 成功したかどうか
    message: "LR(0)オートマトンの構築に成功しました。", // メッセージ
  };
};

export default lr0;
