import { useEffect } from "react";

/**
 * Close an overlay (modal/dialog) when the user presses Escape. Registers a
 * window-level keydown listener while mounted and invokes `onClose` on Escape.
 * `onClose` should be stable (e.g. from useState's setter or a memoised
 * callback) so the listener is not re-registered on every render.
 */
export function useEscToClose(onClose: () => void): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
}
