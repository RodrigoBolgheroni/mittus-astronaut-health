"use client";

import { useRef, type KeyboardEvent } from "react";

import { Card } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { ScaleOption } from "@/components/ui/ScaleOption";
import type { ScaleDef } from "./scales";

type ScaleCardProps = {
  scale: ScaleDef;
  value: number;
  onChange: (value: number) => void;
  /** Card height in the 1280 canvas (Figma). */
  canvasHeight: number;
};

/** Figma "Scale · <name>" card: heading, option faces, SELECTED description, direction legend. */
export function ScaleCard({ scale, value, onChange, canvasHeight }: ScaleCardProps) {
  const group = useRef<HTMLDivElement>(null);
  const selected = scale.options.find((opt) => opt.value === value) ?? scale.options[0];
  const first = scale.options[0];
  const last = scale.options[scale.options.length - 1];
  const headingId = `scale-${scale.id}-title`;

  // Radio-group keyboard behaviour: arrows move the selection, focus follows it.
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const step =
      event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 0;
    if (step === 0) return;
    event.preventDefault();
    const next = Math.min(last.value, Math.max(first.value, value + step));
    onChange(next);
    group.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]')[next - first.value]?.focus();
  }

  return (
    <Card
      className="flex flex-col gap-gap p-pad canvas:h-(--card-h) canvas:overflow-hidden"
      style={{ "--card-h": `${canvasHeight}px` } as React.CSSProperties}
    >
      <div className="flex min-h-12 items-center gap-gap">
        <Icon name={scale.headingIcon} />
        <h2 id={headingId} className="font-display text-card text-ivory">
          {scale.title}
        </h2>
      </div>

      <div
        ref={group}
        role="radiogroup"
        aria-labelledby={headingId}
        onKeyDown={onKeyDown}
        className={`grid gap-3 ${scale.options.length === 7 ? "grid-cols-4 sm:grid-cols-7" : "grid-cols-3 sm:grid-cols-5"}`}
      >
        {scale.options.map((opt) => (
          <ScaleOption key={opt.value} selected={opt.value === value} label={opt.label} onSelect={() => onChange(opt.value)}>
            <Icon name={opt.icon} />
          </ScaleOption>
        ))}
      </div>

      <div className="flex min-h-[72px] flex-col gap-1.5">
        <p className="text-eyebrow text-muted">SELECTED</p>
        <p aria-live="polite" className="text-option text-ivory">
          {selected.label}
        </p>
      </div>

      {scale.legend ? (
        <div className="flex justify-between gap-gap text-caption text-muted">
          <p className="canvas:w-[450px]">{`${first.value} · ${first.label}`}</p>
          <p className="text-right canvas:w-[450px]">{`${last.value} · ${last.label}`}</p>
        </div>
      ) : null}
    </Card>
  );
}
