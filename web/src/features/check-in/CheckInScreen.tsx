"use client";

import { useCheckIn } from "./CheckInProvider";
import { DescriptionStep } from "./DescriptionStep";
import { DiscardScreen } from "./FeedbackScreens";
import { ReviewStep } from "./ReviewStep";
import { ScaleStep } from "./ScaleStep";
import type { StepId } from "./scales";

/** Renders one check-in step, or the Discard confirmation when it is open. */
export function CheckInScreen({ step }: { step: StepId }) {
  const { discardOpen } = useCheckIn();
  if (discardOpen) return <DiscardScreen />;
  if (step === "description") return <DescriptionStep />;
  if (step === "review") return <ReviewStep />;
  return <ScaleStep step={step} />;
}
