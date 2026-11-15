import type { CSSProperties, ReactNode } from "react";

import { Navigation, type NavId } from "./Navigation";
import { StatusPill } from "@/components/ui/StatusPill";

type Overlay = "bg-72" | "bg-82" | "none";

const OVERLAY: Record<Overlay, string> = {
  "bg-72": "bg-bg-72",
  "bg-82": "bg-bg-82",
  none: "",
};

type AppShellProps = {
  active: NavId;
  title: string;
  subtitle: string;
  /** Overlay over the background image (Figma: 0.82 check-in, 0.72 stress, none on home). */
  overlay?: Overlay;
  /** Gradient on the image (alpha 0 in the Stress frame). */
  gradient?: boolean;
  /** SIMULATED DATA pill (absent in the Home frame). */
  pill?: boolean;
  /** Mission footer (absent in the Home frame). */
  footer?: boolean;
  children: ReactNode;
};

type SlotProps = {
  /** Y in the 1280 x 832 canvas. Below 1280px the slot is part of the normal flow. */
  top: number;
  /** X in the canvas (default: content column). */
  left?: number;
  width?: number;
  className?: string;
  children: ReactNode;
};

/** Absolutely positioned (>= 1280px) block of page content. */
export function Slot({ top, left, width, className = "", children }: SlotProps) {
  const style = {
    "--slot-top": `${top}px`,
    ...(left !== undefined && { "--slot-left": `${left}px` }),
    ...(width !== undefined && { "--slot-width": `${width}px` }),
  } as CSSProperties;
  return (
    <div
      style={style}
      className={`min-w-0 canvas:absolute canvas:top-(--slot-top) ${
        left === undefined ? "canvas:left-(--content-x)" : "canvas:left-(--slot-left)"
      } ${width === undefined ? "canvas:w-(--content-width)" : "canvas:w-(--slot-width)"} ${className}`}
    >
      {children}
    </div>
  );
}

// PENDING (P13): mission footer text is prototype data hard-coded in Figma.
const FOOTER_LEFT = "ALEX MORGAN     /     MISSION DAY 024";
const FOOTER_RIGHT = "14 NOV 2026   ·   14:30 UTC";

/**
 * Page chrome from the Figma frames: background + overlay, navigation, heading,
 * SIMULATED DATA pill and mission footer. The canvas is 1280 x 832; below 1280px
 * the pieces stack and the page scrolls.
 */
export function AppShell({
  active,
  title,
  subtitle,
  overlay = "bg-82",
  gradient = true,
  pill = true,
  footer = true,
  children,
}: AppShellProps) {
  return (
    <div className="relative min-h-screen overflow-x-clip bg-bg">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="moon-bg" data-gradient={gradient ? "on" : "none"} />
        <div className={`absolute inset-0 ${OVERLAY[overlay]}`} />
      </div>

      <div
        className="relative mx-auto flex w-full max-w-(--canvas-width) flex-col gap-gap px-4 py-4
          canvas:block canvas:h-(--canvas-height) canvas:max-w-none canvas:w-(--canvas-width) canvas:p-0"
      >
        <Navigation active={active} />

        <header
          className="flex flex-col gap-[3px] canvas:absolute canvas:left-(--content-x) canvas:top-(--heading-y)
            canvas:h-[136px] canvas:w-(--heading-width) canvas:overflow-hidden"
        >
          <p className="text-eyebrow whitespace-pre text-cyan">{"MITTUS  /  CREW WELLBEING"}</p>
          <h1 className="font-display text-title text-ivory">{title}</h1>
          <p className="text-body text-muted">{subtitle}</p>
        </header>

        {pill ? (
          <StatusPill className="canvas:absolute canvas:left-(--pill-x) canvas:top-(--pill-y)">
            SIMULATED DATA
          </StatusPill>
        ) : null}

        <main className="contents">{children}</main>

        {footer ? (
          <footer
            className="flex flex-wrap justify-between gap-gap text-eyebrow whitespace-pre text-ivory
              canvas:absolute canvas:left-(--content-x) canvas:top-(--footer-y) canvas:w-(--footer-width)"
          >
            <p>{FOOTER_LEFT}</p>
            <p>{FOOTER_RIGHT}</p>
          </footer>
        ) : null}
      </div>
    </div>
  );
}
