import { createPortal } from "react-dom";
import { SymbolLookupMenu } from "./SymbolLookupMenu.tsx";
import type { IdentifierMenu } from "@/web/lib/useIdentifierMenu.ts";
import type { MenuOp, SearchSide } from "../state/useCodeSearch.ts";

/**
 * Renders {@link SymbolLookupMenu} for an open identifier selection via a portal
 * to `document.body`, so the floating menu escapes any `overflow`/`clip`
 * ancestor and layers above modals (the navigator, the full-file view). Returns
 * null when no menu is open.
 *
 * @param props.menu - The open menu descriptor, or null.
 * @param props.onPick - Called with the chosen lookup op + checkout side.
 * @param props.onClose - Dismiss the menu.
 */
export function IdentifierMenuPortal(props: {
  menu: IdentifierMenu | null;
  onPick: (op: MenuOp, side: SearchSide) => void;
  onClose: () => void;
}): React.JSX.Element | null {
  const { menu, onPick, onClose } = props;
  if (!menu) return null;
  // Key by the selection so a new selection remounts the menu, re-seeding its
  // side toggle from the new selection's default side.
  return createPortal(
    <SymbolLookupMenu
      key={`${menu.term}:${menu.x}:${menu.y}`}
      term={menu.term} x={menu.x} y={menu.y} defaultSide={menu.side}
      onPick={onPick} onClose={onClose}
    />,
    document.body,
  );
}
