"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { useRouter } from "next/navigation";

import { AppShell, Slot } from "@/components/shell/AppShell";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Icon, type IconName } from "@/components/ui/Icon";
import { useCheckIn } from "./CheckInProvider";
import { stepPath } from "./scales";
import { useConfirmSave } from "./useConfirmSave";

type PanelProps = {
  /** Panel height in the 1280 canvas. */
  height: number;
  icon: IconName;
  iconClass?: string;
  title: string;
  titleClass: string;
  text: string;
  role?: "alertdialog" | "status" | "alert";
  children?: ReactNode;
};

/** Centered panel used by Saving / Save error / Discard (Figma 1002 wide, glass). */
function Panel({ height, icon, iconClass, title, titleClass, text, role, children }: PanelProps) {
  return (
    <Slot top={236}>
      <Card
        role={role}
        aria-labelledby="feedback-title"
        aria-describedby="feedback-text"
        style={{ "--panel-h": `${height}px` } as React.CSSProperties}
        className="flex min-h-[320px] flex-col items-center justify-center gap-gap p-pad text-center canvas:h-(--panel-h) canvas:overflow-hidden"
      >
        <Icon name={icon} className={iconClass} />
        <h2 id="feedback-title" className={`font-display text-ivory ${titleClass}`}>
          {title}
        </h2>
        <p id="feedback-text" className="text-body-md text-muted">
          {text}
        </p>
        {children}
      </Card>
    </Slot>
  );
}

/** Figma 69:2306 "Saving feedback". */
export function SavingScreen() {
  return (
    <AppShell active="checkin" title="Saving your check-in…" subtitle="Your answers are being recorded.">
      <Panel
        role="status"
        height={420}
        icon="loader-circle"
        iconClass="spin"
        title="One moment"
        titleClass="text-feedback"
        text="Keeping your daily journey up to date."
      />
    </AppShell>
  );
}

/** Figma 32:550 "Save error". */
export function SaveErrorScreen() {
  const { errorDetail } = useCheckIn();
  const confirmSave = useConfirmSave();
  const router = useRouter();
  const retry = useRef<HTMLButtonElement>(null);
  useEffect(() => retry.current?.focus(), []);

  return (
    <AppShell active="checkin" title="Couldn’t save your check-in." subtitle="Your answers are still here.">
      <Panel
        role="alert"
        height={440}
        icon="circle-x-64"
        title="Let’s try once more."
        titleClass="text-success"
        text="You won’t need to fill everything in again."
      >
        {errorDetail ? <p className="sr-only">{errorDetail}</p> : null}
        <div className="flex w-full max-w-[620px] flex-wrap justify-center gap-gap">
          <Button ref={retry} onClick={confirmSave} className="min-w-0 flex-1 basis-[200px]">
            Try again
          </Button>
          <Button variant="secondary" onClick={() => router.push(stepPath("review"))} className="min-w-0 flex-1 basis-[200px]">
            Review answers
          </Button>
        </div>
      </Panel>
    </AppShell>
  );
}

/** Figma 69:2370 "Discard confirmation". */
export function DiscardScreen() {
  const { keepEditing } = useCheckIn();
  const router = useRouter();
  const keep = useRef<HTMLButtonElement>(null);
  useEffect(() => keep.current?.focus(), []);

  return (
    <AppShell active="checkin" title="Leave this check-in?" subtitle="Your changes have not been saved.">
      <Panel
        role="alertdialog"
        height={420}
        icon="circle-x-60"
        title="Keep your progress?"
        titleClass="text-feedback"
        text="You can return to your answers or discard this entry."
      >
        <div className="flex w-full max-w-[620px] flex-wrap justify-center gap-gap">
          <Button ref={keep} onClick={keepEditing} className="min-w-0 flex-1 basis-[200px]">
            Keep editing
          </Button>
          <Button
            variant="secondary"
            // The provider lives under /check-in, so leaving the flow discards the answers.
            onClick={() => router.push("/")}
            className="min-w-0 flex-1 basis-[200px]"
          >
            Discard changes
          </Button>
        </div>
      </Panel>
    </AppShell>
  );
}
