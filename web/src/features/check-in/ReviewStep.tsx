"use client";

import Link from "next/link";

import { Slot } from "@/components/shell/AppShell";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { useCheckIn } from "./CheckInProvider";
import { SaveErrorScreen, SavingScreen } from "./FeedbackScreens";
import { SCALE_MAX, formatHours, stepPath, type ScaleId } from "./scales";
import { StepFrame } from "./StepFrame";
import { useConfirmSave } from "./useConfirmSave";

const CARDS: { id: ScaleId; left: number; top: number }[] = [
  { id: "stress", left: 188, top: 258 },
  { id: "mood", left: 700, top: 258 },
  { id: "team", left: 188, top: 422 },
  { id: "fatigue", left: 700, top: 422 },
];

const HINT = "Tap a card to edit your answer.";

export function ReviewStep() {
  const { answers, scales, status, askDiscard } = useCheckIn();
  const confirmSave = useConfirmSave();

  if (status === "saving") return <SavingScreen />;
  if (status === "error") return <SaveErrorScreen />;

  const description = answers.description.trim();

  return (
    <StepFrame step="review">
      <div className="grid gap-gap canvas:contents md:grid-cols-2">
        {CARDS.map(({ id, left, top }) => {
          const scale = scales[id];
          const option = scale.options.find((o) => o.value === answers[id]);
          return (
            <Slot key={id} top={top} left={left} width={490}>
              <Card
                as={Link}
                href={stepPath(id)}
                aria-label={`Edit ${scale.title}: ${answers[id]} of ${SCALE_MAX[id]}, ${option?.label}`}
                className="flex flex-col gap-2 p-pad text-left transition-opacity hover:opacity-90 canvas:h-[148px] canvas:overflow-hidden"
              >
                <div className="flex min-h-7 items-center gap-gap">
                  <Icon name={scale.reviewIcon} />
                  <span className="text-label text-muted">{scale.title}</span>
                  <span className="text-value text-cyan">{`${answers[id]} / ${SCALE_MAX[id]}`}</span>
                </div>
                <p className="text-body-md text-ivory">{option?.label}</p>
              </Card>
            </Slot>
          );
        })}
      </div>

      <Slot top={590}>
        <Card className="flex min-h-16 flex-wrap items-center gap-gap px-pad py-[18px] canvas:h-16 canvas:overflow-hidden">
          <Icon name="moon-22-review" />
          <span className="text-body text-muted">Sleep</span>
          <span className="text-[18px] text-ivory">{formatHours(answers.sleepHours)}</span>
          <Link href={stepPath("fatigue")} className="text-caption text-muted underline-offset-4 hover:underline">
            {HINT}
          </Link>
        </Card>
      </Slot>

      <Slot top={660}>
        <Card
          as={Link}
          href={stepPath("description")}
          className="flex min-h-16 flex-wrap items-center gap-gap px-pad py-[18px] canvas:h-16 canvas:overflow-hidden"
        >
          <Icon name="clipboard-list" />
          <span className="text-body text-muted">Description</span>
          <span className="max-w-[420px] truncate text-[18px] text-ivory">{description || "Optional note"}</span>
          <span className="text-caption text-muted">{HINT}</span>
        </Card>
      </Slot>

      <Slot top={732}>
        <div className="flex flex-wrap gap-gap">
          <ButtonLink variant="secondary" href={stepPath("description")} className="canvas:w-[190px]">
            ← Back
          </ButtonLink>
          <Button onClick={() => void confirmSave()} className="canvas:w-[280px]">
            Confirm & save
          </Button>
          <Button variant="quiet" onClick={askDiscard} className="canvas:w-[180px]">
            Cancel
          </Button>
        </div>
      </Slot>
    </StepFrame>
  );
}
