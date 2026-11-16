"use client";

import type { ReactNode } from "react";

import { AppShell, Slot } from "@/components/shell/AppShell";
import { Stepper } from "@/components/ui/Stepper";
import { STEP_LABELS, type StepId } from "./scales";

const META: Record<StepId, { title: string; subtitle: string; active: number[] }> = {
  stress: { title: "How stressed do you feel?", subtitle: "Step 1 of 6 · Stress", active: [1] },
  mood: { title: "How’s your mood today?", subtitle: "Step 2 of 6 · Mood", active: [2] },
  team: { title: "How is your team getting along?", subtitle: "Step 3 of 6 · Team conflict", active: [3] },
  fatigue: { title: "How tired do you feel?", subtitle: "Step 4 of 6 · Fatigue", active: [4] },
  description: { title: "Add a description.", subtitle: "Step 5 of 6 · Description", active: [5] },
  // Review highlights steps 5 and 6 in Figma (PENDING P8).
  review: { title: "Ready to save your check-in?", subtitle: "Step 6 of 6 · Review your answers.", active: [5, 6] },
};

/** Shell + stepper shared by the six check-in steps. */
export function StepFrame({ step, children }: { step: StepId; children: ReactNode }) {
  const meta = META[step];
  return (
    <AppShell
      active="checkin"
      title={meta.title}
      subtitle={meta.subtitle}
      // Figma: Stress frame uses the 0.72 overlay and a transparent gradient; the others 0.82.
      overlay={step === "stress" ? "bg-72" : "bg-82"}
      gradient={step !== "stress"}
    >
      <Slot top={192}>
        <Stepper steps={STEP_LABELS} active={meta.active} />
      </Slot>
      {children}
    </AppShell>
  );
}

export const STEP_FRAME_META = META;
