import type { MissionContext, MissionPhase } from "@/lib/api/types";

/**
 * Pure model for /mission: URL <-> state mapping, map geometry from the Figma
 * frames (30:319, 32:237, 52:1306, 52:1463, 52:1620) and display formatters.
 * No React here so it can be unit tested with node --test.
 */

export type Direction = "outbound" | "return";
export type Focus = "earth" | "spacecraft" | "moon";

export const FOCUSES: readonly Focus[] = ["earth", "spacecraft", "moon"];

/** Direction -> phase of GET /api/mission-context. */
export const PHASE_BY_DIRECTION: Record<Direction, MissionPhase> = {
  outbound: "in_orbit",
  return: "return_to_earth",
};

/** Figma selector literals; the API's `phaseLabel` is identical (MISSION config). */
export const DIRECTION_LABEL: Record<Direction, string> = {
  outbound: "In orbit",
  return: "Return to Earth",
};

export const DIRECTIONS: readonly Direction[] = ["outbound", "return"];

/** `?direction=return` -> "return"; anything else is the default outbound view. */
export function parseDirection(value: string | null | undefined): Direction {
  return value === "return" ? "return" : "outbound";
}

export function parseFocus(value: string | null | undefined): Focus | null {
  return FOCUSES.find((f) => f === value) ?? null;
}

export function buildQuery(direction: Direction, focus: Focus | null): string {
  const params = new URLSearchParams();
  if (direction === "return") params.set("direction", "return");
  if (focus) params.set("focus", focus);
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

/** Figma heading copy per direction (30:319 and 32:237). */
export const HEADING: Record<Direction, { title: string; subtitle: string }> = {
  outbound: {
    title: "Between Earth and the Moon.",
    subtitle: "Explore your journey. Select Earth, the spacecraft or the Moon to zoom in.",
  },
  return: {
    title: "The journey home.",
    subtitle: "Follow your return from lunar orbit to Earth. Select a point to explore.",
  },
};

// ---- Map geometry (px in the 1002 x 496 "Mission world" of the overview frames) ----

export const WORLD = { width: 1002, height: 496 } as const;
export const EARTH = { left: 60, top: 192, size: 260 } as const;
export const MOON = { left: 770, top: 48, size: 158 } as const;
export const HOTSPOT_SIZE = 64;

/** Spacecraft hotspot and label positions: 30:319 (outbound) and 32:237 (return). */
export const SPACECRAFT: Record<Direction, { hotspot: { left: number; top: number }; label: { left: number; top: number } }> = {
  outbound: { hotspot: { left: 501, top: 195 }, label: { left: 452, top: 270 } },
  return: { hotspot: { left: 386, top: 248 }, label: { left: 355, top: 323 } },
};

/** Zoom scale per focus read from 52:1306 (1.65), 52:1463 (1.55) and 52:1620 (2.45). */
export const ZOOM_SCALE: Record<Focus, number> = { earth: 1.65, spacecraft: 1.55, moon: 2.45 };

/** Center of each focus target in world coordinates. */
export function focusCenter(focus: Focus, direction: Direction): { x: number; y: number } {
  if (focus === "earth") return { x: EARTH.left + EARTH.size / 2, y: EARTH.top + EARTH.size / 2 };
  if (focus === "moon") return { x: MOON.left + MOON.size / 2, y: MOON.top + MOON.size / 2 };
  const h = SPACECRAFT[direction].hotspot;
  return { x: h.left + HOTSPOT_SIZE / 2, y: h.top + HOTSPOT_SIZE / 2 };
}

/** Where the zoom target lands in the viewport next to the 340 px panel (all three Figma zooms). */
export const ZOOM_TARGET_OVERLAY = { x: 279, y: 244 } as const;
/** Stacked layout (no panel over the map): center of the viewport. */
export const ZOOM_TARGET_CENTER = { x: 501, y: 248 } as const;

export type WorldTransform = { x: number; y: number; scale: number };

/** Overview: the world sits at (-1, -1) in the padding box (Figma). */
export const OVERVIEW_TRANSFORM: WorldTransform = { x: -1, y: -1, scale: 1 };

export function zoomTransform(
  focus: Focus,
  direction: Direction,
  target: { x: number; y: number },
): WorldTransform {
  const s = ZOOM_SCALE[focus];
  const c = focusCenter(focus, direction);
  return { x: round2(target.x - s * c.x), y: round2(target.y - s * c.y), scale: s };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export type Star = { left: number; top: number; size: 1 | 2 };

/** The 52 stars of the Figma "Mission world" (52:1219 and siblings): [left, top, size px]. */
const STAR_DATA: readonly (readonly [number, number, 1 | 2])[] = [
  [30, 20, 2],
  [179, 117, 1],
  [328, 214, 1],
  [477, 311, 1],
  [626, 408, 1],
  [775, 55, 1],
  [924, 152, 1],
  [133, 249, 1],
  [282, 346, 1],
  [431, 443, 2],
  [580, 90, 1],
  [729, 187, 1],
  [878, 284, 1],
  [87, 381, 1],
  [236, 28, 1],
  [385, 125, 1],
  [534, 222, 1],
  [683, 319, 1],
  [832, 416, 2],
  [41, 63, 1],
  [190, 160, 1],
  [339, 257, 1],
  [488, 354, 1],
  [637, 451, 1],
  [786, 98, 1],
  [935, 195, 1],
  [144, 292, 1],
  [293, 389, 2],
  [442, 36, 1],
  [591, 133, 1],
  [740, 230, 1],
  [889, 327, 1],
  [98, 424, 1],
  [247, 71, 1],
  [396, 168, 1],
  [545, 265, 1],
  [694, 362, 2],
  [843, 459, 1],
  [52, 106, 1],
  [201, 203, 1],
  [350, 300, 1],
  [499, 397, 1],
  [648, 44, 1],
  [797, 141, 1],
  [946, 238, 1],
  [155, 335, 2],
  [304, 432, 1],
  [453, 79, 1],
  [602, 176, 1],
  [751, 273, 1],
  [900, 370, 1],
  [109, 467, 1],
];

export function buildStars(): Star[] {
  return STAR_DATA.map(([left, top, size]) => ({ left, top, size }));
}

// ---- Source labels and formatters ----

type PositionSource = MissionContext["location"]["source"];

/** Short visible tag for where a position comes from. */
export const POSITION_SOURCE_TAG: Record<PositionSource, string> = {
  wheretheiss: "Live",
  wheretheiss_snapshot: "Snapshot",
  celestrak_tle: "TLE",
  simulated: "Simulated",
};

export function positionSourceTag(source: PositionSource): string {
  return POSITION_SOURCE_TAG[source];
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** `14 Nov · 14:20 UTC` (Figma "Sample time"), optionally with the year. Null if unparsable. */
export function formatUtc(iso: string | null | undefined, withYear = false): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  const date = `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}${withYear ? ` ${d.getUTCFullYear()}` : ""}`;
  return `${date} · ${hh}:${mm} UTC`;
}

export function formatCelsius(celsius: number | null): string | null {
  return celsius === null ? null : `${celsius.toFixed(1)}°C`;
}

export function formatCoordinates(lat: number, lon: number, altitudeKm: number): string {
  const ns = lat >= 0 ? "N" : "S";
  const ew = lon >= 0 ? "E" : "W";
  return `${Math.abs(lat).toFixed(2)}° ${ns}, ${Math.abs(lon).toFixed(2)}° ${ew}, ${Math.round(altitudeKm)} km altitude`;
}

export function formatKm(km: number): string {
  return `${Math.round(km).toLocaleString("en-US")} km`;
}

/** Text alternative for the (schematic) trajectory graphic. */
export function describeTrajectory(ctx: MissionContext): string {
  const { location, departure, destination } = ctx;
  return (
    `Schematic route, not to scale. ${ctx.vehicle} travels from ${departure.name} to ${destination.name}. ` +
    `Current phase: ${ctx.phaseLabel}, ${ctx.status}. ` +
    `Position ${formatCoordinates(location.latitude, location.longitude, location.altitudeKm)}, ` +
    `${formatKm(destination.distanceKm)} from the destination. ` +
    `Position source: ${positionSourceTag(location.source)} (${location.label}).`
  );
}

// ---- Detail panel (Figma "Zoom detail panel", 340 x 448) ----

export type DetailRow = { label: string; value: string; note?: string };

export const DETAIL_COPY: Record<Focus, { tone: "cyan" | "purple"; title: string; subtitle: string }> = {
  earth: { tone: "cyan", title: "Earth, your home base.", subtitle: "Departure and recovery context for your crew." },
  spacecraft: { tone: "cyan", title: "Your cabin, in context.", subtitle: "The environment accompanying your journey." },
  moon: { tone: "purple", title: "Your next horizon.", subtitle: "A closer look at the destination ahead." },
};

/**
 * Rows of each detail view. Labels follow Figma where the contract has the field;
 * the Figma mock values ("Day 3", "22.4°C", "Alex Morgan", ...) are never used.
 */
export function detailRows(focus: Focus, ctx: MissionContext): DetailRow[] {
  const { location, cabinTemperature, departure, destination } = ctx;
  if (focus === "earth") {
    return [
      { label: "Launch site", value: departure.name },
      {
        label: "Departed",
        value: formatUtc(departure.departedAt, true) ?? "Not recorded",
        ...(departure.departedAtSource ? { note: `Source: ${departure.departedAtSource}` } : {}),
      },
      { label: "Crew status", value: ctx.status },
      { label: "Next destination", value: destination.name },
    ];
  }
  if (focus === "spacecraft") {
    return [
      { label: "Phase", value: ctx.phaseLabel },
      {
        label: "Cabin temperature",
        value: formatCelsius(cabinTemperature.celsius) ?? "Sample pending",
        note: cabinTemperature.label,
      },
      {
        label: "Sample time",
        value: formatUtc(cabinTemperature.measuredAt) ?? "No sample time",
      },
      {
        label: "Position source",
        value: positionSourceTag(location.source),
        note: [location.label, formatCoordinates(location.latitude, location.longitude, location.altitudeKm), formatUtc(location.asOf)]
          .filter(Boolean)
          .join(" · "),
      },
    ];
  }
  return [
    { label: "Destination", value: destination.name },
    { label: "Route status", value: ctx.status },
    { label: "Distance from current position", value: formatKm(destination.distanceKm) },
    { label: "About", value: destination.description },
  ];
}
