import type { ReactNode } from "react";

type ScaleOptionProps = {
  /** Visible to assistive tech: the option label (the Figma button only shows an icon). */
  label: string;
  selected: boolean;
  onSelect: () => void;
  children: ReactNode;
};

/** One face button of a scale (Figma `input/<scale>/<n> · <label>`): 94px high, 2px border. */
export function ScaleOption({ label, selected, onSelect, children }: ScaleOptionProps) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-label={label}
      tabIndex={selected ? 0 : -1}
      title={label}
      onClick={onSelect}
      className={`flex h-[94px] min-w-0 items-center justify-center rounded-option border-2 border-solid bg-surface-50 transition-opacity hover:opacity-90 ${
        selected ? "border-cyan" : "border-line"
      }`}
    >
      {children}
    </button>
  );
}
