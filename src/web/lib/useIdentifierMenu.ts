import { useCallback, useState } from "react";
import { isIdentifier, fileFromSectionId, parseDataSide } from "./identifierMenu.ts";
import type { SearchSide } from "@/web/state/useCodeSearch.ts";

/** A pending symbol-lookup menu anchored at a viewport position. */
export interface IdentifierMenu {
  /** The selected identifier term to look up. */
  term: string;
  /** Viewport x for the menu's left edge. */
  x: number;
  /** Viewport y for the menu's top edge. */
  y: number;
  /** Repo-relative path of the `.file-section` the selection is in (scope hint), or "". */
  file: string;
  /**
   * The checkout side the selection sits on (from the code cell's `data-side`):
   * a deleted/base line → "base", an added/context/head line → "head". Used as
   * the menu's default side.
   */
  side: SearchSide;
}

/** The identifier-menu trigger: current menu + handlers to attach to a container. */
export interface UseIdentifierMenu {
  /** The open menu descriptor, or null when nothing is selected. */
  menu: IdentifierMenu | null;
  /** Attach to a code container's `onMouseUp` (drag-select / primary click). */
  onMouseUp: () => void;
  /** Attach to a code container's `onDoubleClick` (word select). */
  onDoubleClick: () => void;
  /** Dismiss the menu. */
  close: () => void;
}

/** The closest ancestor element of a DOM node (the node itself if it is one). */
function elementFor(node: Node | null): Element | null {
  return node instanceof Element ? node : node?.parentElement ?? null;
}

/** The repo-relative file of the section containing a DOM node, or "". */
function fileForNode(node: Node | null): string {
  const section = elementFor(node)?.closest(".file-section");
  return fileFromSectionId(section?.id ?? "");
}

/** The checkout side of the code cell containing a DOM node (defaults to head). */
function sideForNode(node: Node | null): SearchSide {
  const cell = elementFor(node)?.closest("[data-side]");
  return parseDataSide(cell?.getAttribute("data-side") ?? null);
}

/** Read the current single-identifier text selection, if any, with its rect. */
function readSelection(): IdentifierMenu | null {
  const sel = window.getSelection();
  const term: string = sel?.toString().trim() ?? "";
  if (!sel || sel.rangeCount === 0 || !isIdentifier(term)) return null;
  const range = sel.getRangeAt(0);
  const rect = range.getBoundingClientRect();
  return {
    term, x: rect.left, y: rect.bottom + 4,
    file: fileForNode(range.startContainer), side: sideForNode(range.startContainer),
  };
}

/**
 * The reusable double-click / drag-select identifier trigger, attachable to any
 * code container. On mouse-up or double-click it reads the current text
 * selection and, when it is a single valid identifier, exposes a `menu`
 * descriptor (term + viewport position + enclosing file scope). The caller
 * renders the floating menu (portaled above modals) and clears it via `close`.
 */
export function useIdentifierMenu(): UseIdentifierMenu {
  const [menu, setMenu] = useState<IdentifierMenu | null>(null);
  const update = useCallback((): void => setMenu(readSelection()), []);
  const close = useCallback((): void => setMenu(null), []);
  return { menu, onMouseUp: update, onDoubleClick: update, close };
}
