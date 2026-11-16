"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo, type ReactNode } from "react";

import { AppShell, Slot } from "@/components/shell/AppShell";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useCheckInOptions, useCheckIns, type CheckIn } from "@/lib/api";
import { HistoryChart } from "./HistoryChart";
import {
  FATIGUE_MAX,
  HISTORY_COPY as COPY,
  HISTORY_LIMIT,
  chartCaption,
  chartModel,
  formatRange,
  historySubtitle,
  parseMetric,
  recentRows,
  type HistoryMetric,
} from "./history-data";

const CHART_TITLE_ID = "history-chart-title";

/**
 * Figma Mittus/Button/Secondary at 244 x 36 (chart header). Local variant: the
 * shared Button is 48 tall. Hover/active derived like the shared buttons.
 */
const TOGGLE_CLASS =
  "inline-flex h-9 w-full items-center justify-center rounded-pill border border-solid border-line bg-surface px-6 " +
  "text-body whitespace-nowrap text-ivory transition-opacity hover:opacity-90 active:opacity-75 sm:w-[244px] sm:shrink-0";

const METRIC = {
  sleep: {
    title: COPY.sleepTitle,
    heading: COPY.sleepHeading,
    toggle: { label: COPY.toFatigue, href: "/history?metric=fatigue" },
    valueHeader: "Hours of sleep",
  },
  fatigue: {
    title: COPY.fatigueTitle,
    heading: COPY.fatigueHeading,
    toggle: { label: COPY.toSleep, href: "/history" },
    valueHeader: `Self-reported fatigue (1–${FATIGUE_MAX})`,
  },
} as const;

type ViewState =
  | { kind: "loading" }
  | { kind: "error"; retry: () => void }
  | { kind: "empty" }
  | { kind: "ready"; items: CheckIn[] };

/** /history (Figma 30:132) and /history?metric=fatigue (Figma 36:502). */
export function HistoryScreen() {
  const metric = parseMetric(useSearchParams().get("metric"));
  const checkIns = useCheckIns(HISTORY_LIMIT);
  const options = useCheckInOptions();

  const moodLabels = useMemo(
    () => (options.data ? new Map(options.data.mood_level.map((o) => [o.value, o.label])) : null),
    [options.data],
  );

  const items = checkIns.data?.items;
  const { refetch } = checkIns;
  let state: ViewState;
  if (items && items.length > 0) state = { kind: "ready", items };
  else if (items) state = { kind: "empty" };
  else if (checkIns.error) state = { kind: "error", retry: () => void refetch() };
  else state = { kind: "loading" };

  return <HistoryView metric={metric} state={state} moodLabels={moodLabels} />;
}

/** Suspense fallback while the URL is read (prerendered shell). */
export function HistoryFallback() {
  return <HistoryView metric="sleep" state={{ kind: "loading" }} moodLabels={null} />;
}

function HistoryView({
  metric,
  state,
  moodLabels,
}: {
  metric: HistoryMetric;
  state: ViewState;
  moodLabels: ReadonlyMap<number, string> | null;
}) {
  const config = METRIC[metric];
  const items = state.kind === "ready" ? state.items : [];

  return (
    <AppShell
      active="history"
      title={config.title}
      subtitle={historySubtitle(items)}
      overlay="bg-72"
    >
      <Slot top={202}>
        {/* Figma "Seven-day sleep chart" / "Seven-day fatigue chart": 1002 x 308. */}
        <Card
          as="section"
          tone="glass"
          aria-labelledby={CHART_TITLE_ID}
          className="flex flex-col gap-gap p-pad canvas:h-[308px] canvas:overflow-hidden"
        >
          <div className="flex flex-col gap-gap sm:h-[37px] sm:flex-row sm:items-center sm:justify-between">
            <h2 id={CHART_TITLE_ID} className="font-display text-card text-ivory sm:w-[340px]">
              {config.heading}
            </h2>
            <Link href={config.toggle.href} scroll={false} className={TOGGLE_CLASS}>
              {config.toggle.label}
            </Link>
          </div>
          <ChartBody metric={metric} state={state} />
        </Card>
      </Slot>

      {state.kind === "ready" ? (
        <Slot top={522}>
          <RecentCheckIns items={state.items} moodLabels={moodLabels} />
        </Slot>
      ) : null}
    </AppShell>
  );
}

function ChartBody({ metric, state }: { metric: HistoryMetric; state: ViewState }) {
  if (state.kind !== "ready") return <StateMessage state={state} />;
  const model = chartModel(state.items, metric);
  const first = model.points[0].date;
  const last = model.points[model.points.length - 1].date;
  return (
    <>
      <p className="text-pill whitespace-nowrap text-muted">{chartCaption(model)}</p>
      <HistoryChart
        model={model}
        tableCaption={`${METRIC[metric].heading}, ${formatRange(first, last)}`}
        valueHeader={METRIC[metric].valueHeader}
      />
    </>
  );
}

/** PENDING (copy/design): History has no loading, error or empty frame in Figma. */
function StateMessage({ state }: { state: Exclude<ViewState, { kind: "ready" }> }) {
  let body: ReactNode;
  if (state.kind === "loading") {
    body = (
      <p role="status" className="text-body text-muted">
        {COPY.loading}
      </p>
    );
  } else if (state.kind === "error") {
    body = (
      <>
        <p role="alert" className="text-body text-ivory">
          {COPY.error}
        </p>
        <Button variant="secondary" onClick={state.retry} className="w-fit canvas:w-[216px]">
          {COPY.retry}
        </Button>
      </>
    );
  } else {
    body = (
      <>
        <p role="status" className="text-body text-ivory">
          {COPY.empty}
        </p>
        <ButtonLink href="/check-in/stress" className="w-fit canvas:w-[216px]">
          {COPY.emptyAction}
        </ButtonLink>
      </>
    );
  }
  return <div className="flex min-h-[172px] flex-col items-start justify-center gap-gap">{body}</div>;
}

/** Figma "Recent check-ins" (1002 x 250): DATE / SLEEP / FATIGUE / MOOD, columns 224 + gap 12. */
function RecentCheckIns({
  items,
  moodLabels,
}: {
  items: CheckIn[];
  moodLabels: ReadonlyMap<number, string> | null;
}) {
  const rows = recentRows(items, moodLabels);
  const head = "h-[25px] p-0 pr-3 text-left align-top text-caption font-normal text-muted";
  const fixed = `${head} canvas:w-[236px]`;
  const cell = "h-[25px] p-0 pr-3 align-top text-caption text-ivory";
  return (
    <Card tone="glass" className="overflow-x-auto p-pad canvas:h-[250px] canvas:overflow-hidden">
      {/* border-spacing-y 16 = Figma gap between caption, header and rows. */}
      <table className="w-full border-separate border-spacing-x-0 border-spacing-y-4 canvas:w-[950px] canvas:table-fixed">
        <caption className="text-left font-display text-card text-ivory">{COPY.recentHeading}</caption>
        <thead>
          <tr>
            <th scope="col" className={fixed}>
              {COPY.columns.date}
            </th>
            <th scope="col" className={fixed}>
              {COPY.columns.sleep}
            </th>
            <th scope="col" className={fixed}>
              {COPY.columns.fatigue}
            </th>
            <th scope="col" className={head}>
              {COPY.columns.mood}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <th scope="row" className={`${cell} text-left font-normal`}>
                {row.date}
              </th>
              <td className={cell}>{row.sleep}</td>
              <td className={cell}>{row.fatigue}</td>
              <td className={cell}>{row.mood}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
