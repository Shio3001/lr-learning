import Textarea from "../atoms/textarea";
import Button from "../atoms/button";

import { getRawBNFWarningThrows } from "../compiler/parseBnf";

import { useEffect, useState } from "react";
const MainPage = () => {
  const [bnf, setBnf] = useState<string>("");
  return (
    <div>
      <h1>プログラミング言語処理系 LR(0)報 構文解析 支援サイト</h1>
      <Textarea handler={setBnf} />
      <div>
        <p>
          {getRawBNFWarningThrows(bnf)
            .map((w) => `Line ${w.line}: ${w.error}`)
            .join("\n") || "警告はありません"}
        </p>
      </div>
      <Button />
      <div></div>
    </div>
  );
};
export default MainPage;
