// tsLexerLib.ts
// 文字列入力を TypeScript 純正スキャナで字句解析して、位置情報付きトークン列を返す。

import * as ts from "typescript";

export type TokenCategory = "keyword" | "identifier" | "literal" | "punctuation" | "trivia" | "other";
// TokenCategoryはそれぞれ
// keyword: if, else, return, function, ...
// identifier: 変数名、関数名、クラス名など
// literal: 数値リテラル、文字列リテラル、真偽値リテラルなど
// punctuation: ; , . ( ) { } [ ] < > + - * / = などの記号
// trivia: 空白、改行、コメントなどの解析に影響しない部分
// other: 上記に分類されないその他のトークン

export type Token = {
  kindId: number; // ts.SyntaxKind の数値
  kind: string; // "Identifier" など
  category: TokenCategory; // 見やすさ用のざっくり分類
  text: string; // 元のソース断片
  start: number; // 0-based オフセット（含む）
  end: number; // 0-based オフセット（除外）
  line: number; // 1-based 開始行
  column: number; // 1-based 開始列
  endLine: number; // 1-based 終了行（end 位置）
  endColumn: number; // 1-based 終了列（end 位置）
};

export type LexOptions = {
  includeTrivia?: boolean; // 空白/改行/コメントも取りたいとき true
  jsx?: boolean; // TSX/JSX を解析したいとき true
  target?: ts.ScriptTarget; // 既定: Latest
};

// --- 行頭配列をつくって、オフセット→(行,列) に変換 ---
function buildLineStarts(text: string): number[] {
  const starts = [0];
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    if (ch === 13 /* \r */) {
      if (i + 1 < text.length && text.charCodeAt(i + 1) === 10 /* \n */) i++;
      starts.push(i + 1);
    } else if (ch === 10 /* \n */) {
      starts.push(i + 1);
    }
  }
  return starts;
}

function posToLineCol(pos: number, lineStarts: number[]) {
  let lo = 0,
    hi = lineStarts.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const start = lineStarts[mid];
    const next = mid + 1 < lineStarts.length ? lineStarts[mid + 1] : Number.POSITIVE_INFINITY;
    if (pos < start) hi = mid - 1;
    else if (pos >= next) lo = mid + 1;
    else return { line: mid + 1, column: pos - start + 1 };
  }
  return { line: 1, column: pos + 1 };
}
export const getTsSyntaxKindList = (): string[] => {
  const kinds: string[] = [];
  for (const name in ts.SyntaxKind) {
    const val = (ts.SyntaxKind as any)[name];
    if (typeof val === "number") {
      kinds[val] = name;
    }
  }
  return kinds;
};

function categorize(kind: ts.SyntaxKind): TokenCategory {
  if (kind >= ts.SyntaxKind.FirstKeyword && kind <= ts.SyntaxKind.LastKeyword) return "keyword";
  if (kind === ts.SyntaxKind.Identifier) return "identifier";
  if (
    kind === ts.SyntaxKind.NumericLiteral ||
    kind === ts.SyntaxKind.StringLiteral ||
    kind === ts.SyntaxKind.BigIntLiteral ||
    kind === ts.SyntaxKind.TrueKeyword ||
    kind === ts.SyntaxKind.FalseKeyword ||
    kind === ts.SyntaxKind.NullKeyword ||
    kind === ts.SyntaxKind.NoSubstitutionTemplateLiteral ||
    kind === ts.SyntaxKind.TemplateHead ||
    kind === ts.SyntaxKind.TemplateMiddle ||
    kind === ts.SyntaxKind.TemplateTail
  )
    return "literal";
  if (kind >= ts.SyntaxKind.FirstPunctuation && kind <= ts.SyntaxKind.LastPunctuation) return "punctuation";
  if (
    kind === ts.SyntaxKind.WhitespaceTrivia ||
    kind === ts.SyntaxKind.NewLineTrivia ||
    kind === ts.SyntaxKind.SingleLineCommentTrivia ||
    kind === ts.SyntaxKind.MultiLineCommentTrivia ||
    kind === ts.SyntaxKind.ShebangTrivia
  )
    return "trivia";
  return "other";
}

// --- メイン: 文字列を字句解析 ---
export function lex(text: string, opts: LexOptions = {}): Token[] {
  const { includeTrivia = false, jsx = false, target = ts.ScriptTarget.Latest } = opts;

  const scanner = ts.createScanner(target, /*skipTrivia*/ !includeTrivia, jsx ? ts.LanguageVariant.JSX : ts.LanguageVariant.Standard, text);

  const lineStarts = buildLineStarts(text);
  const out: Token[] = [];

  while (true) {
    const kind = scanner.scan();
    if (kind === ts.SyntaxKind.EndOfFileToken) break;

    const start = scanner.getTokenStart();
    const end = scanner.getTokenEnd();
    const txt = scanner.getTokenText();

    const { line, column } = posToLineCol(start, lineStarts);
    const { line: endLine, column: endColumn } = posToLineCol(end, lineStarts);

    out.push({
      kindId: kind,
      kind: ts.SyntaxKind[kind] ?? String(kind),
      category: categorize(kind),
      text: txt,
      start,
      end,
      line,
      column,
      endLine,
      endColumn,
    });
  }

  return out;
}

// --- 逐次処理版 ---
export function* scan(text: string, opts: LexOptions = {}): Generator<Token> {
  const tokens = lex(text, opts);
  for (const t of tokens) yield t;
}
