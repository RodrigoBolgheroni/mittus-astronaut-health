"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { AppShell, Slot } from "@/components/shell/AppShell";
import { ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { StatusPill } from "@/components/ui/StatusPill";
import { useCheckIn } from "./CheckInProvider";
import { SCALE_MAX, stepPath } from "./scales";

/** Mood tone for the three Figma Saved frames (normal 32:139 / low 33:450 / good 33:494). */
export type MoodTone = "normal" | "low" | "good";
export const moodTone = (moodLevel: number): MoodTone => (moodLevel >= 4 ? "low" : moodLevel <= 2 ? "good" : "normal");

export function SavedScreen() {
  const { saved } = useCheckIn();
  const router = useRouter();

  // Direct visit / reload: nothing was saved in this session of the flow.
  useEffect(() => {
    if (!saved) router.replace(stepPath("stress"));
  }, [saved, router]);

  if (!saved) return null;

  const values = [
    { label: "Stress", text: `${saved.stress_level} / ${SCALE_MAX.stress}` },
    { label: "Mood", text: `${saved.mood_level} / ${SCALE_MAX.mood}` },
    { label: "Team conflict", text: `${saved.team_conflict_level} / ${SCALE_MAX.team}` },
    { label: "Fatigue", text: `${saved.fatigue} / ${SCALE_MAX.fatigue}` },
  ];

  return (
    <AppShell active="checkin" title="Check-in saved." subtitle="Your daily journey is moving forward.">
      <Slot top={222}>
        <Card
          data-mood-tone={moodTone(saved.mood_level)}
          className="flex flex-col items-center justify-center gap-[18px] p-pad text-center canvas:h-[470px] canvas:overflow-hidden"
        >
          <Icon name="circle-check" />
          <h2 role="status" className="font-display text-success text-ivory">
            You showed up for yourself.
          </h2>
          {/* PENDING: "+40 XP" is a prototype value (P13). */}
          <StatusPill tone="cyan">STEP 1 COMPLETE · +40 XP</StatusPill>
          <dl className="grid w-full max-w-[860px] grid-cols-2 gap-gap canvas:grid-cols-4">
            {values.map((v) => (
              <div key={v.label} className="flex flex-col items-center gap-1.5">
                <dt className="text-caption text-muted">{v.label}</dt>
                <dd className="text-brand text-ivory">{v.text}</dd>
              </div>
            ))}
          </dl>
          <div className="flex flex-wrap justify-center gap-gap">
            <ButtonLink variant="secondary" href="/" className="canvas:w-[240px]">
              Back to home
            </ButtonLink>
            <ButtonLink variant="quiet" href={stepPath("stress")} className="canvas:w-[260px]">
              Edit this check-in
            </ButtonLink>
          </div>
        </Card>
      </Slot>

      {/* Not in Figma: shows the saved record id and the replace rule (requested by the API contract). */}
      <Slot top={704}>
        <p className="text-center text-caption text-muted">
          {`Record ID · ${saved.id} · Saving again for ${saved.check_in_date} (UTC) replaces this entry.`}
        </p>
      </Slot>
    </AppShell>
  );
}
