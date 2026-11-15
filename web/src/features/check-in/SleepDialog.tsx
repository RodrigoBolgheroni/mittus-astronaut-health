"use client";

import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";

/** Parses "8.5", "8.5 h", "8,5"; returns null when outside 0-24 or > 2 decimals. */
export function parseHours(raw: string): number | null {
  const text = raw.trim().replace(/\s*h$/i, "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return null;
  const n = Number(text);
  return n >= 0 && n <= 24 ? n : null;
}

type SleepDialogProps = { open: boolean; onClose: () => void; onUse: (hours: number) => void };

/** Figma 108:2221 "Check-in · Custom sleep hours" (448 x 278). */
export function SleepDialog({ open, onClose, onUse }: SleepDialogProps) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      labelledBy="sleep-dialog-title"
      describedBy="sleep-dialog-hint"
      className="w-[448px] rounded-card"
    >
      {/* Remounted on every open, so the field starts empty. */}
      <SleepForm onClose={onClose} onUse={onUse} />
    </Dialog>
  );
}

function SleepForm({ onClose, onUse }: Pick<SleepDialogProps, "onClose" | "onUse">) {
  const [raw, setRaw] = useState("");
  const [invalid, setInvalid] = useState(false);

  function submit(event: FormEvent) {
    event.preventDefault();
    const hours = parseHours(raw);
    if (hours === null) {
      setInvalid(true);
      return;
    }
    onUse(hours);
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3.5 rounded-card bg-glass p-pad">
      <h2 id="sleep-dialog-title" className="text-hours-title text-ivory">
        Hours slept
      </h2>
      <p id="sleep-dialog-hint" className="text-body text-muted">
        Enter the total hours you slept.
      </p>
      <input
        autoFocus
        inputMode="decimal"
        autoComplete="off"
        placeholder="8.5 h"
        value={raw}
        onChange={(e) => {
          setRaw(e.target.value);
          setInvalid(false);
        }}
        aria-labelledby="sleep-dialog-title"
        aria-describedby={invalid ? "sleep-dialog-hint sleep-dialog-error" : "sleep-dialog-hint"}
        aria-invalid={invalid}
        className={`h-[58px] w-full rounded-card border border-solid bg-glass px-pad text-body-lg text-ivory placeholder:text-muted ${
          invalid ? "border-purple" : "border-line"
        }`}
      />
      {/* PENDING: validation copy is not in Figma (derived, see implementation-notes.md). */}
      {invalid ? (
        <p id="sleep-dialog-error" role="alert" className="-mt-1.5 text-caption text-purple">
          Enter hours from 0 to 24 (up to two decimals).
        </p>
      ) : null}
      <div className="flex gap-3">
        <Button variant="secondary" className="min-w-0 flex-[182]" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" className="min-w-0 flex-[204]">
          Use these hours
        </Button>
      </div>
    </form>
  );
}
