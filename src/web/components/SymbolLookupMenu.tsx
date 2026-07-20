import { useState } from "react";
import { CloseIcon } from "./Icons.tsx";
import type { MenuOp, SearchSide } from "../state/useCodeSearch.ts";

/**
 * A small floating menu shown when a symbol is selected in the diff, offering
 * the three lookup actions and a head/base checkout toggle. The side toggle
 * starts on `defaultSide` — which reflects the column/line the symbol was
 * selected in (before → base, after → head) — and stays overridable.
 */
export function SymbolLookupMenu(props: {
  term: string;
  x: number;
  y: number;
  defaultSide: SearchSide;
  onPick: (op: MenuOp, side: SearchSide) => void;
  onClose: () => void;
}): React.JSX.Element {
  const { term, x, y, defaultSide, onPick, onClose } = props;
  const [side, setSide] = useState<SearchSide>(defaultSide);

  return (
    <div className="symbol-menu" style={{ left: x, top: y }}>
      <code className="symbol-menu-term">{term}</code>
      <span className="symbol-menu-side">
        <button type="button" className={side === "head" ? "active" : ""} onClick={() => setSide("head")}>Head</button>
        <button type="button" className={side === "base" ? "active" : ""} onClick={() => setSide("base")}>Base</button>
      </span>
      <button type="button" className="btn btn-sm" onClick={() => onPick("definition", side)}>Definition</button>
      <button type="button" className="btn btn-sm" onClick={() => onPick("usages", side)}>Usages</button>
      <button type="button" className="btn btn-sm" onClick={() => onPick("search", side)}>Search</button>
      <button type="button" className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Close"><CloseIcon size={14} /></button>
    </div>
  );
}
