import { AppShell, Slot } from "@/components/shell/AppShell";
import { ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Metric } from "@/components/ui/Metric";
import { BodyHotspot } from "@/features/history/BodyHotspot";

// Figma 01 · Home · Overview (30:2). No overlay, no SIMULATED DATA pill and no
// mission footer in the live frame (PENDING P3).
export default function HomePage() {
  return (
    <AppShell
      active="home"
      title="Your space. Your wellbeing."
      subtitle="A moment to check in, wherever the mission takes you."
      overlay="none"
      pill={false}
      footer={false}
    >
      <Slot top={230} width={446}>
        {/* PENDING: values are the Figma mock; wire to the latest check-in next round. */}
        <div className="flex flex-wrap gap-gap">
          <Metric label="Sleep" value="6.5 h" detail="Latest check-in" />
          <Metric label="Fatigue" value="6 / 10" detail="Self-reported" />
        </div>
      </Slot>

      <Slot top={405} width={446}>
        {/* PENDING: counts/task are Figma mock content; checklist data comes with the Plan feature. */}
        <Card tone="glass" className="flex flex-col gap-3.5 p-pad canvas:h-[242px] canvas:overflow-hidden">
          <h2 className="font-display text-section text-ivory">Daily checklist</h2>
          <p className="text-body-lg text-ivory">1 of 3 tasks complete</p>
          <p className="text-body leading-[1.17] text-ivory">Next task · Review your check-in insight</p>
          <ButtonLink href="/plan" className="w-fit canvas:w-[212px]">
            Open checklist
          </ButtonLink>
        </Card>
      </Slot>

      <Slot top={687} width={490}>
        <div className="flex flex-wrap gap-gap">
          <ButtonLink href="/check-in/stress" className="canvas:w-[216px]">
            Daily check-in
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
