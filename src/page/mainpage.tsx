import Textarea from "../atoms/textarea";
import Button from "../atoms/button";

import { getRawBNFWarningThrows, parseRawBnf } from "../compiler/parseBnf";
import lr0 from "../compiler/lr0";
import { BNFSet } from "../compiler/interface/bnf";

import { useEffect, useState } from "react";
const MainPage = () => {
  const [bnf, setBnf] = useState<string>("S->STMT 'EoF'\nSTMT->'Ex' EXP\nEXP->'NUM'");
  return (
    <div>
      <h1>プログラミング言語処理系 LR(0)法 構文解析 支援サイト</h1>
      <Textarea text={bnf} handler={setBnf} />
      <p>ε : 空集合記号（コピーして使ってください）</p>
      <div>
        {/* エラーをそれぞれpタグで囲って表示 */}
        {getRawBNFWarningThrows(bnf).map((e, i) => (
          <p key={i} style={{ color: e.isError ? "red" : "orange" }}>
            (行: {e.line}) {e.error}
          </p>
        ))}
      </div>
      <Button
        handler={() => {
          const pbnf = getRawBNFWarningThrows(bnf).length === 0 ? parseRawBnf(bnf) : new BNFSet();
          console.log(lr0(pbnf));
        }}
        text="この構文定義で構築を開始する"
      />
      <div></div>
    </div>
  );
};
export default MainPage;
