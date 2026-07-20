/**
 * A labelled iOS-style on/off toggle switch. The whole row (label + switch) is
 * one click target: it is a `<label>` wrapping a visually-hidden native
 * checkbox (given `role="switch"` so it is announced as a switch), so it stays
 * keyboard-operable (Space toggles), shows the shared focus ring on keyboard
 * focus, and clicking the label toggles it — all for free from the native
 * control. The visible track + knob are driven purely by the checkbox state.
 */
export function Switch(props: {
  /** Whether the switch is on. */
  checked: boolean;
  /** Called with the new on/off state when toggled. */
  onChange: (checked: boolean) => void;
  /** Visible label, also the control's accessible name. */
  label: string;
}): React.JSX.Element {
  const { checked, onChange, label } = props;
  return (
    <label className="switch-row">
      <span className="switch-label">{label}</span>
      <input
        type="checkbox"
        role="switch"
        className="switch-input"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="switch-track" aria-hidden="true"><span className="switch-knob" /></span>
    </label>
  );
}
