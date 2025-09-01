import Textarea from "../atoms/textarea";
import Button from "../atoms/button";

import { getRawBNFWarningThrows } from "../compiler/parseBnf";

import { useEffect, useState } from "react";
const MainPage = () => {
  const [bnf, setBnf] = useState<string>("");
  return (
    <div>
      <h1>プログラミング言語処理系 LR(0)法 構文解析 支援サイト</h1>
      <Textarea handler={setBnf} />
      <p>ε : 空集合記号（コピーして使ってください）</p>
      <div>
        {/* エラーをそれぞれpタグで囲って表示 */}
        {getRawBNFWarningThrows(bnf).map((e, i) => (
          <p key={i} style={{ color: e.isError ? "red" : "orange" }}>
            (行: {e.line}) {e.error}
          </p>
        ))}
      </div>
      <Button text="この構文定義で構築を開始する" />
      <div></div>
    </div>
  );
};
export default MainPage;
