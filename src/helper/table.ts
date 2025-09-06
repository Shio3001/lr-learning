/** 規則同値判定（equals/toString ではなく getHash を使う） */
export const eqConcat = (a: any, b: any) => {
  const ah = a?.getHash?.();
  const bh = b?.getHash?.();
  return ah != null && bh != null ? ah === bh : a === b;
};
