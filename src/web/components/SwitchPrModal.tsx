import { PrPicker } from "./PrPicker.tsx";
import { useEscToClose } from "@/web/lib/useEscToClose.ts";
import { CloseIcon } from "./Icons.tsx";

/**
 * The in-review "Switch PR" overlay: the same {@link PrPicker} shown on the
 * home screen, in a modal. Closes on Escape, the close button, or a click on
 * the backdrop. The current PR is marked (and not clickable) inside the picker.
 */
export function SwitchPrModal(props: { currentPrId: string; onClose: () => void }): React.JSX.Element {
  useEscToClose(props.onClose);
  return (
    <div className="modal-overlay" onClick={props.onClose}>
      <div className="modal picker-modal" onClick={(e) => e.stopPropagation()}>
        <header className="modal-header">
          <strong>Switch pull request</strong>
          <span className="modal-header-spacer" />
          <button type="button" className="modal-close" onClick={props.onClose} aria-label="Close">
            <CloseIcon size={16} />
          </button>
        </header>
        <div className="picker-modal-body">
          <PrPicker currentPrId={props.currentPrId} />
        </div>
      </div>
    </div>
  );
}
