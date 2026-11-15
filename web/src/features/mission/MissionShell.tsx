import type { CSSProperties, ReactNode } from "react";

import { Navigation } from "@/components/shell/Navigation";
import { ButtonLink } from "@/components/ui/Button";
import { StatusPill } from "@/components/ui/StatusPill";

// Local copy of the AppShell chrome without the Moon background: the Mission
// frames have a plain page background (the black map viewport is the only
// image area). AppShell has no option to hide the background and is shared.
// PENDING (P13): footer text is prototype data hard-coded in Figma, as in AppShell.
const FOOTER_LEFT = "MISSION DAY 024";
const FOOTER_RIGHT = "14 NOV 2026   ·   14:30 UTC";

type SlotProps = { top: number; className?: string; children: ReactNode };

/** Block at (188, top) with the 1002 px content width on the 1280 canvas; flows normally below. */
export function MissionSlot({ top, className = "", children }: SlotProps) {
  return (
    <div
      style={{ "--slot-top": `${top}px` } as CSSProperties}
      className={`min-w-0 canvas:absolute canvas:top-(--slot-top) canvas:left-(--content-x) canvas:w-(--content-width) ${className}`}
    >
      {children}
    </div>
  );
}

type MissionShellProps = {
  title: string;
  subtitle: string;
  /** Primary action at the top right (Figma 09 "Register a mission", 220 x 48 at 970, 94). */
  action?: { label: string; href: string };
  /** Footer left text (the registration frame adds the crew member). */
  footerLeft?: string;
  /** Frame height and footer y in the 1280 canvas (the registration frame is 1144 tall, footer at 1105). */
  frame?: { height: number; footerY: number };
  children: ReactNode;
};

export function MissionShell({ title, subtitle, action, footerLeft = FOOTER_LEFT, frame, children }: MissionShellProps) {
  const frameStyle = frame
    ? ({ "--canvas-height": `${frame.height}px`, "--footer-y": `${frame.footerY}px` } as CSSProperties)
    : undefined;
  return (
    <div className="relative min-h-screen overflow-x-clip bg-bg">
      <div
        style={frameStyle}
        className="relative mx-auto flex w-full max-w-(--canvas-width) flex-col gap-gap px-4 py-4
          canvas:block canvas:h-(--canvas-height) canvas:max-w-none canvas:w-(--canvas-width) canvas:p-0"
      >
        <Navigation active="mission" />

        <header
          className="flex flex-col gap-[3px] canvas:absolute canvas:left-(--content-x) canvas:top-(--heading-y)
            canvas:h-[136px] canvas:w-(--heading-width) canvas:overflow-hidden"
        >
          <p className="text-eyebrow whitespace-pre text-cyan">{"MITTUS  /  CREW WELLBEING"}</p>
          <h1 className="font-display text-title text-ivory">{title}</h1>
          <p className="text-body text-muted">{subtitle}</p>
        </header>

        <StatusPill className="canvas:absolute canvas:left-(--pill-x) canvas:top-(--pill-y)">SIMULATED DATA</StatusPill>

        {action ? (
          <ButtonLink href={action.href} className="canvas:absolute canvas:left-[970px] canvas:top-[94px] canvas:w-[220px]">
            {action.label}
          </ButtonLink>
        ) : null}

        <main className="contents">{children}</main>

        <footer
          className="flex flex-wrap justify-between gap-gap text-eyebrow whitespace-pre text-ivory
            canvas:absolute canvas:left-(--content-x) canvas:top-(--footer-y) canvas:w-(--footer-width)"
        >
          <p>{footerLeft}</p>
          <p>{FOOTER_RIGHT}</p>
        </footer>
      </div>
    </div>
  );
}
