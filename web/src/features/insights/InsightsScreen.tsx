"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

import { AppShell, Slot } from "@/components/shell/AppShell";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { StatusPill } from "@/components/ui/StatusPill";
import { buildBasicSummary, generateRecommendation, useCheckIns, type CheckIn } from "@/lib/api";
import { evaluationKey, loadRecommendation, saveRecommendation } from "@/lib/ceres/recommendation-cache";
import { latestCheckIn, type ForecastState } from "./forecast";
import { loadForecast } from "./loadForecast";

type InsightState =
  | { kind: "idle" }
  | { kind: "generating" }
  | { kind: "ready"; title: string; summary: string; nextStep: string }
  | { kind: "fallback"; text: string };

const PANEL_ID = "insights-panel";

function toReady(insight: { title: string; summary: string; next_step: string }): InsightState {
  return { kind: "ready", title: insight.title, summary: insight.summary, nextStep: insight.next_step };
}

/** Full-width state card (Figma 1002 wide, line-55 border). */
function StateCard({
  height,
  pill,
  title,
  children,
}: {
  height: number;
  pill: string;
  title: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card
      tone="glass"
      id={PANEL_ID}
      tabIndex={-1}
      aria-labelledby={`${PANEL_ID}-title`}
      style={{ "--panel-h": `${height}px` } as React.CSSProperties}
      className="flex flex-col items-start gap-gap border-line-55 p-pad outline-none canvas:h-(--panel-h) canvas:overflow-hidden"
    >
      <StatusPill>{pill}</StatusPill>
      <h2 id={`${PANEL_ID}-title`} className="font-display font-medium text-ivory">
        {title}
      </h2>
      {children}
    </Card>
  );
}

function Actions({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap gap-gap">{children}</div>;
}

export function InsightsScreen() {
  const checkIns = useCheckIns(90);
  const latest: CheckIn | null = checkIns.data ? latestCheckIn(checkIns.data.items) : null;
  const latestId = latest?.id ?? null;
  const count = checkIns.data?.items.length ?? 0;

  const [evaluated, setEvaluated] = useState<{ key: string; state: ForecastState } | null>(null);
  const [forecastRun, setForecastRun] = useState(0);
  const [insight, setInsight] = useState<InsightState>({ kind: "idle" });
  const generation = useRef(0);

  // Forecast: evaluate the latest check-in (the backend has no forecast route).
  const forecastKey = latestId ? `${latestId}:${forecastRun}` : null;
  useEffect(() => {
    if (!latestId || !forecastKey) return;
    let current = true;
    void loadForecast(latestId).then((state) => {
      if (current) setEvaluated({ key: forecastKey, state });
    });
    return () => {
      current = false;
    };
  }, [latestId, forecastKey]);

  const forecast: ForecastState = checkIns.loading
    ? { kind: "loading" }
    : checkIns.error
      ? { kind: "unavailable" }
      : !latestId
        ? { kind: "insufficient_history" }
        : evaluated?.key === forecastKey
          ? evaluated.state
          : { kind: "loading" };

  // Ceres: card + AI tasks for the latest check-in (the call takes 6-45 s, so it never blocks the check-in).
  const forecastData = forecast.kind === "ready" ? forecast.forecast : null;
  const generate = useCallback(async () => {
    if (!latest) return;
    const key = evaluationKey(latest, forecastData?.status === "ready" ? forecastData.probability_high_fatigue : null);
    const token = ++generation.current;
    const cached = loadRecommendation(key);
    let next: InsightState;
    if (cached) {
      next = toReady(cached.insight);
    } else {
      setInsight({ kind: "generating" });
      try {
        const result = await generateRecommendation(checkIns.data?.items ?? [latest], forecastData ?? undefined);
        if (token !== generation.current) return;
        saveRecommendation(key, latest.id, result);
        next = toReady(result.insight);
      } catch {
        // Ceres down or not configured: show the recorded values instead.
        next = { kind: "fallback", text: buildBasicSummary(latest) };
      }
    }
    if (token === generation.current) setInsight(next);
  }, [latest, forecastData, checkIns.data]);

  // Generate once per check-in and forecast; "Cancel" and a failure leave the manual retry in place.
  const autoKey = latest && forecast.kind === "ready" ? `${latest.id}:${latest.updated_at}:${forecastRun}` : null;
  const autoRan = useRef<string | null>(null);
  useEffect(() => {
    if (!autoKey || autoRan.current === autoKey) return;
    autoRan.current = autoKey;
    void generate();
  }, [autoKey, generate]);

  const cancel = useCallback(() => {
    generation.current += 1;
    setInsight({ kind: "idle" });
  }, []);

  // Which Figma frame is on screen.
  const view =
    insight.kind === "generating"
      ? "generating"
      : insight.kind === "fallback"
        ? "fallback"
        : forecast.kind === "insufficient_history"
          ? "insufficient"
          : forecast.kind === "unavailable"
            ? "unavailable"
            : "main";

  // Move focus to the new panel when the frame changes (the pressed button is gone).
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    document.getElementById(PANEL_ID)?.focus();
  }, [view]);

  const announce =
    view === "generating"
      ? "Generating insight."
      : view === "fallback"
        ? "Basic summary shown. The generated explanation is unavailable."
        : view === "insufficient"
          ? "Not enough history to estimate fatigue yet."
          : view === "unavailable"
            ? "Forecast temporarily unavailable."
            : insight.kind === "ready"
              ? "Insight ready."
              : forecast.kind === "ready"
                ? "Experimental fatigue estimate ready."
                : "";

  const live = (
    <p role="status" aria-live="polite" className="sr-only">
      {announce}
    </p>
  );

  if (view === "generating") {
    return (
      <AppShell active="insights" title="Finding the context." subtitle="Comparing your latest check-in with your previous entries.">
        {live}
        <Slot top={212}>
          <StateCard height={440} pill="GENERATING INSIGHT" title={<span className="text-[50px] leading-[1.3]">Connecting the dots…</span>}>
            <p className="max-w-[900px] text-value text-muted">
              We are preparing a short explanation of your recent changes in sleep and perceived fatigue.
            </p>
            <Button variant="secondary" onClick={cancel} className="canvas:w-[220px]">
              Cancel
            </Button>
          </StateCard>
        </Slot>
      </AppShell>
    );
  }

  if (view === "fallback" && insight.kind === "fallback") {
    return (
      <AppShell
        active="insights"
        title="Your comparison is still here."
        subtitle="The generated explanation is unavailable. Your entries are safe."
        overlay="bg-82"
      >
        {live}
        <Slot top={212}>
          {/* data-insight-source="basic": values echoed by the client because Ceres was unavailable. */}
          <StateCard height={484} pill="BASIC SUMMARY" title={<span className="text-[42px] leading-[1.3]">The numbers tell part of the story.</span>}>
            <p data-insight-source="basic" className="max-w-[900px] text-value text-ivory">
              {insight.text}
            </p>
            <p className="max-w-[900px] text-label text-muted">This summary uses your recorded values.</p>
            <Actions>
              <Button onClick={() => void generate()} className="canvas:w-[260px]">
                Try generating again
              </Button>
              <ButtonLink variant="secondary" href="/history" className="canvas:w-[216px]">
                View history
              </ButtonLink>
            </Actions>
          </StateCard>
        </Slot>
      </AppShell>
    );
  }

  if (view === "insufficient") {
    return (
      <AppShell
        active="insights"
        title="Your story is still taking shape."
        subtitle="A first entry is a start. More history brings more context."
      >
        {live}
        <Slot top={212}>
          <StateCard
            height={484}
            pill="INSUFFICIENT HISTORY"
            title={
              <span className="block text-[48px] leading-[1.3]">
                Not enough history
                <br />
                to estimate fatigue yet.
              </span>
            }
          >
            {latest ? (
              <p className="max-w-[880px] text-value text-ivory">
                Your check-in is saved. Keep adding daily entries so Mittus can build a comparison over time.
              </p>
            ) : null}
            <p className="max-w-[880px] text-body text-muted">
              The experimental forecast and change plan are unavailable until the model has enough information. No
              suggestion is shown from an older evaluation.
            </p>
            <Actions>
              <ButtonLink href="/check-in" className="canvas:w-[260px]">
                Go to daily check-in
              </ButtonLink>
              {/* PENDING: "View saved entry" target is not defined in Figma; links to /history. */}
              <ButtonLink variant="secondary" href="/history" className="canvas:w-[240px]">
                View saved entry
              </ButtonLink>
            </Actions>
          </StateCard>
        </Slot>
      </AppShell>
    );
  }

  if (view === "unavailable") {
    return (
      <AppShell active="insights" title="Your record is safe." subtitle="The forecast could not be updated right now.">
        {live}
        <Slot top={212}>
          <StateCard
            height={440}
            pill="TEMPORARILY UNAVAILABLE"
            title={
              <span className="block text-[46px] leading-[1.3]">
                An estimate can wait.
                <br />
                Your check-in is saved.
              </span>
            }
          >
            <p className="max-w-[900px] text-[18px] leading-[1.3] text-muted">
              Your recent history remains available. A new change plan will appear when the forecast is ready; older
              suggestions are not shown as current.
            </p>
            <Actions>
              <Button onClick={() => setForecastRun((n) => n + 1)} className="canvas:w-[216px]">
                Retry forecast
              </Button>
              <ButtonLink variant="secondary" href="/history" className="canvas:w-[216px]">
                View history
              </ButtonLink>
            </Actions>
          </StateCard>
        </Slot>
      </AppShell>
    );
  }

  // Figma 30:274: insight card + Eres forecast card (overlay 0.72).
  return (
    <AppShell
      active="insights"
      title="Make sense of the changes."
      subtitle="See what changed and what you can do next."
      overlay="bg-72"
    >
      {live}
      <Slot top={207}>
        <Card
          tone="glass"
          id={PANEL_ID}
          tabIndex={-1}
          aria-labelledby="insight-title"
          className="flex flex-col items-start gap-3 p-pad outline-none canvas:h-[280px] canvas:overflow-y-auto"
        >
          <p className="text-caption text-cyan">AI RECOMMENDATION</p>
          <h2 id="insight-title" className="font-display text-[34px] leading-[1.17] font-medium text-ivory">
            {insight.kind === "ready" ? insight.title : "Check-in insight"}
          </h2>
          {insight.kind === "ready" ? (
            <div data-insight-source="api" className="flex max-w-[954px] flex-col gap-2">
              <p className="text-body-lg text-ivory">{insight.summary}</p>
              <p className="text-body text-muted">{insight.nextStep}</p>
            </div>
          ) : null}
          <Actions>
            {insight.kind === "ready" ? (
              <ButtonLink href="/plan" className="canvas:w-[256px]">
                Open task checklist
              </ButtonLink>
            ) : (
              <Button onClick={() => void generate()} disabled={!latest} className="canvas:w-[256px]">
                Generate insight
              </Button>
            )}
          </Actions>
        </Card>
      </Slot>

      <Slot top={511}>
        <Card
          tone="glass"
          aria-labelledby="forecast-title"
          aria-busy={forecast.kind === "loading"}
          className="flex flex-col items-start gap-[7px] p-pad canvas:h-[222px] canvas:overflow-hidden"
        >
          <h2 id="forecast-title" className="font-display text-card leading-[1.17] font-medium text-ivory">
            Experimental fatigue estimate
          </h2>
          {forecast.kind === "ready" ? (
            <>
              <p className="font-display text-[56px] leading-[1.09] font-medium text-ivory">{forecast.percent}%</p>
              <p className="text-body-lg text-ivory">Chance of reporting high fatigue at your next check-in.</p>
              <p className="text-body text-ivory">Based on {count} check-ins · Trained on simulated data.</p>
            </>
          ) : (
            // Loading: skeleton in the place of the value (not designed in Figma).
            <div aria-hidden="true" className="mt-2 flex w-full max-w-[420px] animate-pulse flex-col gap-3">
              <div className="h-12 w-28 rounded-row bg-line-65" />
              <div className="h-4 w-full rounded-row bg-line-65" />
            </div>
          )}
        </Card>
      </Slot>
    </AppShell>
  );
}
