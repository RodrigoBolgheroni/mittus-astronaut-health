"use client";

import { Slot } from "@/components/shell/AppShell";
import { ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { useCheckIn } from "./CheckInProvider";
import { stepPath } from "./scales";
import { StepFrame } from "./StepFrame";

/** Backend limit (docs/check-ins-database.md). */
const MAX_LENGTH = 2000;

export function DescriptionStep() {
  const { answers, setAnswer } = useCheckIn();
  return (
    <StepFrame step="description">
      <Slot top={258}>
        <Card tone="glass" className="flex flex-col gap-3.5 p-pad canvas:h-[320px] canvas:overflow-hidden">
          {/* Figma 161:1646: 32px clipboard-list + Cormorant 28, row of 48. */}
          <div className="flex h-12 items-center gap-gap">
            <Icon name="clipboard-list-32" />
            <h2 className="font-display text-card text-ivory">
              <label htmlFor="check-in-description">Description</label>
            </h2>
          </div>
          <p id="check-in-description-hint" className="text-body leading-[1.17] text-muted">
            Optional. Note discomfort, changes in your routine, or anything you want to remember.
          </p>
          <textarea
            id="check-in-description"
            aria-describedby="check-in-description-hint"
            maxLength={MAX_LENGTH}
            value={answers.description}
            onChange={(e) => setAnswer("description", e.target.value)}
            placeholder="Write a note about today’s check-in…"
            className="glass min-h-[180px] w-full resize-none rounded-card border border-solid border-line bg-glass p-pad text-body-md leading-[1.17] text-ivory placeholder:text-muted canvas:h-[180px]"
          />
        </Card>
      </Slot>
      <Slot top={618}>
        <div className="flex flex-wrap gap-gap">
          <ButtonLink variant="secondary" href={stepPath("fatigue")} className="canvas:w-[190px]">
            ← Back
          </ButtonLink>
          <ButtonLink href={stepPath("review")} className="canvas:w-[280px]">
            Review check-in →
          </ButtonLink>
        </div>
      </Slot>
    </StepFrame>
  );
}
