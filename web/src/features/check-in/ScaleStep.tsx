"use client";

import { useState } from "react";

import { Slot } from "@/components/shell/AppShell";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { Icon } from "@/components/ui/Icon";
import { useCheckIn } from "./CheckInProvider";
import { ScaleCard } from "./ScaleCard";
import { SleepDialog } from "./SleepDialog";
import { SLEEP_PRESETS, formatHours, stepPath, type ScaleId, type StepId } from "./scales";
import { StepFrame } from "./StepFrame";

const PREV: Partial<Record<StepId, StepId>> = { mood: "stress", team: "mood", fatigue: "team" };
const NEXT: Partial<Record<StepId, StepId>> = { stress: "mood", mood: "team", team: "fatigue", fatigue: "description" };

// Figma layout (1280 canvas): card height and navigation top per step.
const CARD_HEIGHT = { stress: 382, mood: 382, team: 382, fatigue: 338 } as const;
const NAV_TOP = { stress: 668, mood: 668, team: 668, fatigue: 712 } as const;

export function ScaleStep({ step }: { step: ScaleId }) {
  const { answers, setAnswer, scales, askDiscard } = useCheckIn();
  const prev = PREV[step];
  const next = NEXT[step]!;
  const continueLabel = step === "fatigue" ? "Continue to description →" : "Continue →";

  return (
    <StepFrame step={step}>
      <Slot top={258}>
        <ScaleCard
          scale={scales[step]}
          value={answers[step]}
          onChange={(v) => setAnswer(step, v)}
          canvasHeight={CARD_HEIGHT[step]}
        />
      </Slot>

      {step === "fatigue" ? (
        <Slot top={612}>
          <SleepContext />
        </Slot>
      ) : null}

      <Slot top={NAV_TOP[step]}>
        <div className="flex flex-wrap gap-gap">
          {prev ? (
            <ButtonLink variant="secondary" href={stepPath(prev)} className="canvas:w-[190px]">
              ← Back
            </ButtonLink>
          ) : (
            <Button variant="secondary" onClick={askDiscard} className="canvas:w-[190px]">
              Cancel
            </Button>
          )}
          <ButtonLink href={stepPath(next)} className="canvas:w-[280px]">
            {continueLabel}
          </ButtonLink>
        </div>
      </Slot>
    </StepFrame>
  );
}

/** Figma "Sleep context" row (78:2206): Sleep + current value + presets + custom. */
function SleepContext() {
  const { answers, setAnswer } = useCheckIn();
  const [open, setOpen] = useState(false);
  const hours = answers.sleepHours;
  const isPreset = (SLEEP_PRESETS as readonly number[]).includes(hours);

  return (
    <Card className="flex flex-wrap items-center gap-gap p-pad canvas:h-[76px] canvas:flex-nowrap canvas:overflow-hidden">
      <Icon name="moon-24" />
      <span className="text-body-lg text-ivory">Sleep</span>
      <output aria-live="polite" aria-label="Sleep hours selected" className="text-option text-cyan canvas:w-[90px]">
        {formatHours(hours)}
      </output>
      <div role="group" aria-label="Sleep hours" className="flex flex-wrap gap-gap">
        {SLEEP_PRESETS.map((h) => (
          <Chip
            key={h}
            selected={hours === h}
            onClick={() => setAnswer("sleepHours", h)}
            className="canvas:w-[135px]"
          >
            {formatHours(h)}
          </Chip>
        ))}
        <Chip selected={!isPreset} onClick={() => setOpen(true)} aria-haspopup="dialog" className="canvas:w-[135px]">
          Other hours
        </Chip>
      </div>
      <SleepDialog
        open={open}
        onClose={() => setOpen(false)}
        onUse={(h) => {
          setAnswer("sleepHours", h);
          setOpen(false);
        }}
      />
    </Card>
  );
}
