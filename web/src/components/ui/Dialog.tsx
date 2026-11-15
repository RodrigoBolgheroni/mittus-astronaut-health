"use client";

import { useEffect, useRef, type ReactNode } from "react";

type DialogProps = {
  open: boolean;
  onClose: () => void;
  /** id of the visible title element. */
  labelledBy: string;
  describedBy?: string;
  className?: string;
  children: ReactNode;
};

/**
 * Accessible modal built on the native <dialog>: focus is trapped and restored
 * by the browser, Esc closes, clicking the backdrop closes.
 */
export function Dialog({ open, onClose, labelledBy, describedBy, className = "", children }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      className={`m-auto max-w-[calc(100vw-32px)] border border-solid border-line bg-bg p-0 text-ivory ${className}`}
    >
      {open ? children : null}
    </dialog>
  );
}
