"use client";

import { AppShell, Slot } from "@/components/shell/AppShell";
import { ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Metric } from "@/components/ui/Metric";
import { BodyHotspot } from "@/features/history/BodyHotspot";
import { latestCheckIn } from "@/features/plan/plan-model";
import { useCheckInActions, useCheckIns } from "@/lib/api";
import { homeChecklist, homeMetrics } from "./home-model";

const LOADING = { value: "…", detail: "Loading" };

// Figma 01 · Home · Overview (30:2). No overlay, no SIMULATED DATA pill and no
// mission footer in the live frame (PENDING P3).
export function HomeScreen() {
  const checkIns = useCheckIns(1);
  const latest = checkIns.data ? latestCheckIn(checkIns.data.items) : null;
  const today = checkIns.data?.today ?? null;
  // Read-only: Home lists the actions; the evaluation runs on the Plan screen.
  const actions = useCheckInActions(latest?.id);

  const loading = checkIns.loading && !checkIns.data;
  const failed = Boolean(checkIns.error && !checkIns.data);
  const metrics = loading ? { sleep: LOADING, fatigue: LOADING } : homeMetrics(latest, today, failed);

  const checkedToday = Boolean(latest && latest.check_in_date === today);
  const checklist = homeChecklist(checkedToday, actions.data ?? []);
  const checklistLoading = loading || (Boolean(latest) && actions.loading && !actions.data);

  return (
    <AppShell
      active="home"
      title="Your health overview"
      subtitle="A moment to check in, wherever the mission takes you."
      overlay="none"
      pill={false}
      footer={false}
    >
      <Slot top={230} width={446}>
        <div className="flex flex-wrap gap-gap" aria-busy={loading || undefined}>
          <Metric label="Sleep" value={metrics.sleep.value} detail={metrics.sleep.detail} />
          <Metric label="Fatigue" value={metrics.fatigue.value} detail={metrics.fatigue.detail} />
        </div>
      </Slot>

      <Slot top={405} width={446}>
        <Card tone="glass" className="flex flex-col gap-3.5 p-pad canvas:h-[242px] canvas:overflow-hidden">
          <h2 className="font-display text-section text-ivory">Daily checklist</h2>
          {checklistLoading ? (
            <p role="status" className="text-body-lg text-muted">
              Loading your checklist…
            </p>
          ) : failed ? (
            <p className="text-body-lg text-ivory">Your checklist could not be loaded.</p>
          ) : (
            <>
              <p className="text-body-lg text-ivory">{`${checklist.done} of ${checklist.total} tasks complete`}</p>
              <p className="text-body leading-[1.17] text-ivory">
                {checklist.next ? `Next task · ${checklist.next}` : "All tasks are done for today."}
              </p>
            </>
          )}
          <ButtonLink href="/plan" className="w-fit canvas:w-[212px]">
            Open checklist
          </ButtonLink>
        </Card>
      </Slot>

      <Slot top={687} width={490}>
        <div className="flex flex-wrap gap-gap">
          <ButtonLink href="/check-in/stress" className="canvas:w-[216px]">
            {checkedToday ? "Edit check-in" : "Daily check-in"}
          </ButtonLink>
          <ButtonLink variant="secondary" href="/history" className="canvas:w-[216px]">
            View history
          </ButtonLink>
        </div>
      </Slot>

      {/* Body hotspot (30:55) + callout (30:52) open the 109:1903 card. PLACEHOLDER: no .glb in design. */}
      <BodyHotspot />
    </AppShell>
  );
}
