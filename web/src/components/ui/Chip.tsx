import type { ButtonHTMLAttributes } from "react";

type ChipProps = ButtonHTMLAttributes<HTMLButtonElement> & { selected?: boolean };

/**
 * Sleep-hours chip: Figma uses the Secondary button (135 x 48). The selected
 * state is not designed: derived as a cyan border (aria-pressed).
 */
export function Chip({ selected = false, className = "", children, ...rest }: ChipProps) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={`inline-flex h-12 items-center justify-center rounded-pill border border-solid bg-surface px-4 text-body text-ivory whitespace-nowrap transition-opacity hover:opacity-90 active:opacity-75 ${
        selected ? "border-cyan" : "border-line"
      } ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
