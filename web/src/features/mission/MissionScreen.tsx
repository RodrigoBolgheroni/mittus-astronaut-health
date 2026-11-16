"use client";

import Image from "next/image";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import { Button } from "@/components/ui/Button";
import { isApiError, useMissionContext, type MissionContext } from "@/lib/api";

import { MissionShell, MissionSlot } from "./MissionShell";
import {
  buildQuery,
  buildStars,
  describeTrajectory,
  DETAIL_COPY,
  detailRows,
  DIRECTION_LABEL,
  DIRECTIONS,
  EARTH,
  FOCUS_TITLE,
  type Direction,
  type Focus,
  HEADING,
  HOTSPOT_SIZE,
  MOON,
  OVERVIEW_TRANSFORM,
  parseDirection,
  parseFocus,
  PHASE_BY_DIRECTION,
  SPACECRAFT,
  WORLD,
  ZOOM_TARGET_CENTER,
  ZOOM_TARGET_OVERLAY,
  zoomTransform,
} from "./model";

const STARS = buildStars();
const SR_ONLY = "absolute h-px w-px overflow-hidden whitespace-nowrap [clip-path:inset(50%)]";

type Status = "loading" | "error" | "empty" | "ready";

export function MissionScreen() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const direction = parseDirection(searchParams.get("direction"));
  const focus = parseFocus(searchParams.get("focus"));
  const phase = PHASE_BY_DIRECTION[direction];

  const { data, error, loading, refetch } = useMissionContext(phase);
  // The hook keeps the previous phase's data while a new phase loads.
  const ctx = data && data.phase === phase ? data : null;
  const status: Status = ctx ? "ready" : error ? (isApiError(error) && error.status === 404 ? "empty" : "error") : "loading";

  const go = useCallback(
    (nextDirection: Direction, nextFocus: Focus | null) => {
      router.replace(`${pathname}${buildQuery(nextDirection, nextFocus)}`, { scroll: false });
    },
    [pathname, router],
  );

  // Focus management: entering a detail view moves focus to its panel; leaving returns it to the trigger.
  const panelRef = useRef<HTMLDivElement>(null);
  const previousFocus = useRef<Focus | null>(null);
  useEffect(() => {
    if (focus) panelRef.current?.focus();
    else if (previousFocus.current) document.getElementById(`mission-focus-${previousFocus.current}`)?.focus();
    previousFocus.current = focus;
  }, [focus]);

  const heading = focus ? { title: FOCUS_TITLE[focus], subtitle: HEADING.outbound.subtitle } : HEADING[direction];

  return (
    <MissionShell
      title={heading.title}
      subtitle={heading.subtitle}
      // Figma 09 (Moon to Earth) has the "Register a mission" action next to the heading.
      action={direction === "return" && !focus ? { label: "Register a mission", href: "/mission/register" } : undefined}
    >
      <MissionSlot top={202}>
        <MapViewport
          direction={direction}
          focus={focus}
          ctx={ctx}
          status={status}
          loading={loading}
          errorMessage={error?.message ?? null}
          onFocus={(f) => go(direction, f)}
          onRetry={() => void refetch()}
        />
        <DetailPanel
          panelRef={panelRef}
          focus={focus}
          ctx={ctx}
          status={status}
          onBack={() => go(direction, null)}
        />
      </MissionSlot>

      <MissionSlot top={716}>
        <div className="flex flex-col gap-gap canvas:h-12 canvas:flex-row canvas:items-start">
          <DirectionSelector value={direction} onChange={(d) => go(d, focus)} />
          <div className="flex flex-col gap-[3px] text-muted canvas:w-[552px]">
            <p className="text-pill">Simulated route · Not to scale</p>
            <a
              href="https://svs.gsfc.nasa.gov/4310/"
              target="_blank"
              rel="noreferrer"
              className="w-fit text-eyebrow underline-offset-2 hover:underline"
            >
              Imagery: NASA / GSFC / SVS
            </a>
          </div>
        </div>
      </MissionSlot>
    </MissionShell>
  );
}

// ---- Direction selector: radio group (Figma "Selected travel direction") ----

function DirectionSelector({ value, onChange }: { value: Direction; onChange: (d: Direction) => void }) {
  const refs = useRef<Record<Direction, HTMLButtonElement | null>>({ outbound: null, return: null });

  const move = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let next = index;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") next = (index + 1) % DIRECTIONS.length;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = (index + DIRECTIONS.length - 1) % DIRECTIONS.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = DIRECTIONS.length - 1;
    else return;
    e.preventDefault();
    const d = DIRECTIONS[next]!;
    onChange(d);
    refs.current[d]?.focus();
  };

  return (
    <div role="radiogroup" aria-label="Selected travel direction" className="flex flex-col gap-gap sm:flex-row">
      {DIRECTIONS.map((d, i) => {
        const selected = d === value;
        return (
          <Button
            key={d}
            ref={(el) => {
              refs.current[d] = el;
            }}
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            variant={selected ? "primary" : "secondary"}
            className="canvas:w-[204px]"
            onClick={() => onChange(d)}
            onKeyDown={(e) => move(e, i)}
          >
            {DIRECTION_LABEL[d]}
          </Button>
        );
      })}
    </div>
  );
}

// ---- Map ----

function useScale(ref: React.RefObject<HTMLDivElement | null>) {
  const [k, setK] = useState(1);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setK(Math.min(1, el.clientWidth / WORLD.width));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return k;
}

type MapProps = {
  direction: Direction;
  focus: Focus | null;
  ctx: MissionContext | null;
  status: Status;
  loading: boolean;
  errorMessage: string | null;
  onFocus: (f: Focus) => void;
  onRetry: () => void;
};

function MapViewport({ direction, focus, ctx, status, loading, errorMessage, onFocus, onRetry }: MapProps) {
  const outer = useRef<HTMLDivElement>(null);
  const k = useScale(outer);
  const ship = SPACECRAFT[direction];

  // Panel overlays the map from 1280px (target at x=279); stacked below it centers the target.
  const t = focus ? zoomTransform(focus, direction, ZOOM_TARGET_OVERLAY) : OVERVIEW_TRANSFORM;
  const tc = focus ? zoomTransform(focus, direction, ZOOM_TARGET_CENTER) : OVERVIEW_TRANSFORM;
  const worldStyle = {
    "--wx": `${tc.x}px`,
    "--wy": `${tc.y}px`,
    "--wx-o": `${t.x}px`,
    "--wy-o": `${t.y}px`,
    "--ws": t.scale,
  } as CSSProperties;

  const description = ctx ? describeTrajectory(ctx) : "Mission context is not available, so the route cannot be described.";
  const overview = focus === null;

  return (
    <div ref={outer} className="relative w-full" style={{ height: WORLD.height * k }}>
      <section
        aria-label="Trajectory map"
        aria-describedby="mission-trajectory-description"
        aria-busy={status === "loading"}
        style={{ transform: `scale(${k})` }}
        className="absolute left-0 top-0 h-[496px] w-[1002px] origin-top-left overflow-hidden rounded-[32px] border border-solid border-line/60 bg-black"
      >
        <p id="mission-trajectory-description" className={SR_ONLY}>
          {description}
        </p>

        {/* World: transform is the Figma zoom (scale 1 / 1.65 / 1.55 / 2.45). Decorative. */}
        <div
          aria-hidden="true"
          style={worldStyle}
          className="absolute left-0 top-0 h-[496px] w-[1002px] origin-top-left
            [transform:translate(var(--wx),var(--wy))_scale(var(--ws))]
            canvas:[transform:translate(var(--wx-o),var(--wy-o))_scale(var(--ws))]
            transition-transform duration-500 ease-in-out motion-reduce:transition-none"
        >
          {STARS.map((s, i) => (
            <Image
              key={i}
              src={`/design/mission/star-${s.size === 2 ? 0 : 1}.svg`}
              alt=""
              width={s.size}
              height={s.size}
              unoptimized
              className="absolute max-w-none"
              style={{ left: s.left, top: s.top }}
            />
          ))}
          <button
            type="button"
            tabIndex={-1}
            onClick={() => onFocus("earth")}
            className="absolute block cursor-pointer"
            style={{ left: EARTH.left, top: EARTH.top, width: EARTH.size, height: EARTH.size }}
          >
            <Image src="/design/mission/earth-blue-marble.png" alt="" width={EARTH.size} height={EARTH.size} unoptimized className="max-w-none" />
          </button>
          <button
            type="button"
            tabIndex={-1}
            onClick={() => onFocus("moon")}
            className="absolute block cursor-pointer"
            style={{ left: MOON.left, top: MOON.top, width: MOON.size, height: MOON.size }}
          >
            <Image src="/design/mission/moon-svs.png" alt="" width={MOON.size} height={MOON.size} unoptimized className="max-w-none" />
          </button>
          <Image
            src="/design/mission/transfer-trajectory.svg"
            alt=""
            width={WORLD.width}
            height={WORLD.height}
            unoptimized
            className="absolute left-0 top-0 max-w-none"
          />
          <button
            type="button"
            tabIndex={-1}
            onClick={() => onFocus("spacecraft")}
            className="glass absolute flex cursor-pointer items-center justify-center rounded-full border border-solid border-line-65 bg-surface-12"
            style={{ left: ship.hotspot.left, top: ship.hotspot.top, width: HOTSPOT_SIZE, height: HOTSPOT_SIZE }}
          >
            <Image src="/design/icons/rocket.svg" alt="" width={28} height={28} unoptimized className="max-w-none" />
          </button>
        </div>

        {/* Labels (overview only; in Figma they disappear in the zoom frames). */}
        <div
          className={`transition-opacity duration-300 motion-reduce:transition-none ${overview ? "opacity-100" : "pointer-events-none opacity-0"}`}
          {...(overview ? {} : { inert: true })}
        >
          <MapLabel id="mission-focus-earth" onClick={() => onFocus("earth")} style={{ left: 71, top: 437, width: 260 }} gap={2}>
            <span className="text-pill text-cyan">EARTH</span>
            <span className="text-caption text-ivory">Home base · Explore →</span>
          </MapLabel>
          <MapLabel id="mission-focus-moon" onClick={() => onFocus("moon")} style={{ left: 767, top: 220, width: 200 }} gap={2}>
            <span className="text-pill text-purple">THE MOON</span>
            <span className="text-caption text-ivory">Destination · Explore →</span>
          </MapLabel>
          <MapLabel
            id="mission-focus-spacecraft"
            onClick={() => onFocus("spacecraft")}
            style={{ left: ship.label.left - 1, top: ship.label.top - 1, width: 234 }}
            gap={3}
            disabled={status !== "ready"}
          >
            <span className="text-eyebrow text-cyan">YOU ARE HERE</span>
            {ctx ? (
              <>
                <span className="text-body-lg text-ivory">{ctx.phaseLabel}</span>
                <span className="text-pill text-muted">Select to see cabin details</span>
              </>
            ) : (
              <span className="text-pill text-muted">
                {status === "loading" ? "Loading mission context…" : "Mission context unavailable"}
              </span>
            )}
          </MapLabel>
        </div>

        {status === "loading" ? <span role="status" className={SR_ONLY}>Loading mission context</span> : null}
        {loading && ctx ? <span role="status" className={SR_ONLY}>Updating mission context</span> : null}

        {status === "error" || status === "empty" ? (
          <div role="alert" className="absolute left-1/2 top-[34px] w-[340px] -translate-x-1/2 rounded-card border border-solid border-line bg-surface p-pad">
            <p className="font-display text-[32px] leading-[1.3] text-ivory">
              {status === "empty" ? "No mission leg." : "Mission context unavailable."}
            </p>
            <p className="mt-2 text-label text-muted">
              {status === "empty"
                ? `No mission leg is registered for ${DIRECTION_LABEL[direction]}.`
                : "The mission context could not be loaded."}
            </p>
            {status === "error" && errorMessage ? <p className="mt-1 text-pill text-muted">{errorMessage}</p> : null}
            {status === "error" ? (
              <Button variant="secondary" className="mt-4 w-full" onClick={onRetry}>
                Try again
              </Button>
            ) : null}
          </div>
        ) : null}
      </section>
    </div>
  );
}

function MapLabel({
  id,
  onClick,
  style,
  gap,
  disabled,
  children,
}: {
  id: string;
  onClick: () => void;
  style: CSSProperties;
  gap: 2 | 3;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      id={id}
      type="button"
      disabled={disabled}
      onClick={onClick}
      style={{ ...style, gap }}
      className="absolute flex cursor-pointer flex-col items-start text-left whitespace-nowrap disabled:cursor-default"
    >
      {children}
    </button>
  );
}

// ---- Detail panel ----

function DetailPanel({
  panelRef,
  focus,
  ctx,
  status,
  onBack,
}: {
  panelRef: React.RefObject<HTMLDivElement | null>;
  focus: Focus | null;
  ctx: MissionContext | null;
  status: Status;
  onBack: () => void;
}) {
  if (!focus) return null;
  const copy = DETAIL_COPY[focus];
  const rows = ctx ? detailRows(focus, ctx) : [];
  const pill = copy.tone === "cyan" ? "bg-cyan-13 text-cyan" : "bg-purple-13 text-purple";
  return (
    <div
      ref={panelRef}
      tabIndex={-1}
      role="region"
      aria-label={copy.title}
      // Programmatic focus target only: the global :focus-visible ring would frame the whole panel.
      style={{ outline: "none" }}
      className="mt-gap flex flex-col gap-[15px] overflow-y-auto rounded-card border border-solid border-line-65 bg-surface-12 p-pad backdrop-blur-xl
        canvas:absolute canvas:left-[638px] canvas:top-[24px] canvas:mt-0 canvas:h-[448px] canvas:w-[340px]"
    >
      <p className={`w-fit rounded-tag px-3 py-1.5 text-pill ${pill}`}>DETAIL VIEW</p>
      <h2 className="font-display text-[32px] leading-[1.3] text-ivory">{copy.title}</h2>
      <p className="text-label text-muted">{copy.subtitle}</p>
      {ctx ? (
        // Figma: each row is a sibling of the heading, 15px apart (same gap as the panel).
        <dl className="flex flex-col gap-[15px]">
          {rows.map((r) => (
            <div key={r.label} className="flex flex-col gap-px">
              <dt className="text-micro text-muted">{r.label}</dt>
              <dd className="text-body text-ivory">{r.value}</dd>
              {r.note ? <dd className="text-micro text-muted">{r.note}</dd> : null}
            </div>
          ))}
        </dl>
      ) : (
        <p className="text-label text-muted" role="status">
          {status === "loading"
            ? "Loading mission context…"
            : status === "empty"
              ? "No mission leg is registered for this direction."
              : "Mission context unavailable."}
        </p>
      )}
      <BackButton onBack={onBack} />
    </div>
  );
}

function BackButton({ onBack }: { onBack: () => void }) {
  return (
    <Button variant="secondary" className="mt-auto w-full shrink-0" onClick={onBack}>
      ← Full journey
    </Button>
  );
}
