"use client";

import { useState } from "react";

import { Slot } from "@/components/shell/AppShell";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Icon } from "@/components/ui/Icon";

const TITLE_ID = "body-discomfort-title";
const DESC_ID = "body-discomfort-desc";

/**
 * Home body hotspot (Figma 30:2: ellipse 30:55 at 881,246 + callout 30:52 at
 * 992,298) opening "Home · Body discomfort recommendation" (109:1903).
 *
 * PLACEHOLDER: no .glb in design. The body is part of the raster background
 * (bg-moon-body.png); Figma has no 3D model and no per-body-part regions
 * (PENDING P11), so there is no 3D view here, only this single hotspot.
 */
export function BodyHotspot() {
  const [open, setOpen] = useState(false);
  const show = () => setOpen(true);

  return (
    <>
      {/* Callout: the textual equivalent of the hotspot (visible at every width). */}
      <Slot top={298} left={992} width={206}>
        <button
          type="button"
          aria-haspopup="dialog"
          onClick={show}
          className="glass flex w-full flex-col items-start gap-1 rounded-card border border-solid border-line bg-glass pb-pad pl-4 pr-3.5 pt-3.5 text-left
            transition-colors hover:bg-cyan-13 active:bg-cyan-17 canvas:h-[86px]"
        >
          <span className="text-eyebrow whitespace-nowrap text-cyan">BODY DISCOMFORT</span>
          {/* Figma 30:54 wraps at 144px, leaving the arrow on its own line; the break
              is explicit so it does not depend on SF Pro metrics. */}
          <span className="text-caption text-ivory">
            <span className="whitespace-nowrap">View recommendation</span>
            <br />
            <span aria-hidden="true">↗</span>
          </span>
        </button>
      </Slot>

      {/* Ellipse over the figure's chest in the background image (only where the
          image is laid out as in Figma). 44 px hit area around the 22 px ellipse. */}
      <Slot top={235} left={870} width={44} className="hidden canvas:block">
        <button
          type="button"
          aria-haspopup="dialog"
          aria-label="Body discomfort: view recommendation"
          onClick={show}
          className="flex size-11 items-center justify-center rounded-full transition-opacity hover:opacity-80 active:opacity-60"
        >
          <Icon name="hotspot" />
        </button>
      </Slot>

      <BodyDiscomfortDialog open={open} onClose={() => setOpen(false)} />
    </>
  );
}

/**
 * Figma 109:1903 (490 x 344, glass, radius 28, padding 24, gap 14). Copy is the
 * Figma literal. PENDING P10: it says "Shoulders" while the hotspot sits on the
 * chest, and it is health-related copy awaiting product/clinical review; there
 * is no backend field for a reported body area.
 */
function BodyDiscomfortDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} labelledBy={TITLE_ID} describedBy={DESC_ID} className="w-[490px] rounded-card">
      <div className="flex flex-col gap-3.5 rounded-card bg-glass p-pad">
        {/* 34 / 25 px Cormorant have no type token (closest: section 30, card 28). */}
        <h2 id={TITLE_ID} className="font-display text-[34px] leading-[1.17] text-ivory">
          Body discomfort
        </h2>
        <p className="text-body-lg text-ivory">Reported area · Shoulders</p>
        <h3 className="font-display text-[25px] leading-[1.17] text-ivory">Note where you feel discomfort</h3>
        <p id={DESC_ID} className="text-body leading-[1.17] text-ivory">
          Add the affected area and when you first noticed it to today’s check-in. Use the next entry to record any
          change.
        </p>
        <div className="flex gap-3">
          <Button variant="secondary" className="min-w-0 flex-[133]" onClick={onClose}>
            Close
          </Button>
          <ButtonLink href="/check-in/stress" className="min-w-0 flex-[290]">
            Open daily check-in
          </ButtonLink>
        </div>
      </div>
    </Dialog>
  );
}
