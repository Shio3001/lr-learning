// 構文解析木のノードを表す型
export type ParseTreeNode = {
  symbol: string; // 記号（終端または非終端）
  children: ParseTreeNode[]; // 子ノード
};

export type ParseLog = {
  tree: ParseTreeNode;
  state: number;
  token: string;
};
export type ParseLogs = Array<ParseLog>;
