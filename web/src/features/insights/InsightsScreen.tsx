"use client";

import { useEffect, useState } from "react";
import { AppShell, Slot } from "@/components/shell/AppShell";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { StatusPill } from "@/components/ui/StatusPill";
import { evaluateCheckInActions, useCheckIns, type EvaluateActionsResult } from "@/lib/api";

type State = { key: string; result: EvaluateActionsResult | null; error: boolean };

/** The server owns generation, caching, task identities and recommendation provenance. */
export function InsightsScreen() {
  const checkIns = useCheckIns(1);
  const latest = checkIns.data?.items[0];
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<State | null>(null);
  const key = latest ? `${latest.id}:${latest.updated_at}:${attempt}` : null;
  const latestId = latest?.id;
  useEffect(() => {
    if (!latestId || !key) return;
    let current = true;
    void evaluateCheckInActions(latestId).then(
      (result) => { if (current) setState({ key, result, error: false }); },
      () => { if (current) setState({ key, result: null, error: true }); },
    );
    return () => { current = false; };
  }, [latestId, key]);

  const result = state?.key === key ? state?.result : null;
  const failed = Boolean(checkIns.error || (state?.key === key && state?.error));
  const loading = !failed && (checkIns.loading || (latest && state?.key !== key));
  const insight = result?.insight;
  const forecast = result?.forecast;
  const reload = () => {
    setAttempt((value) => value + 1);
    void checkIns.refetch();
  };

  return (
    <AppShell active="insights" title="Check-in recommendations" subtitle="See what changed and what you can do next." overlay="bg-72">
      <Slot top={207}>
        <Card tone="glass" className="flex flex-col items-start gap-3 p-pad canvas:h-[320px] canvas:overflow-y-auto">
          {failed ? (
            <>
              <h2 className="font-display text-card text-ivory">The plan could not be loaded.</h2>
              <p role="alert" className="text-body text-muted">Your check-in remains saved. Reload to get the current recommendation.</p>
              <Button onClick={reload}>Reload plan</Button>
            </>
          ) : loading ? (
            <p role="status" aria-busy="true" className="text-body text-muted">Preparing your saved recommendation and checklist…</p>
          ) : insight ? (
            <>
              <StatusPill>{insight.source === "ai" ? "AI RECOMMENDATION" : "BASIC SUMMARY"}</StatusPill>
              <h2 className="font-display text-[34px] leading-[1.17] text-ivory">{insight.title}</h2>
              <p data-insight-source={insight.source} className="text-body-lg whitespace-pre-line text-ivory">{insight.summary}</p>
              <p className="text-body text-ivory">{insight.next_step}</p>
              <ButtonLink href="/plan" className="shrink-0">Open task checklist</ButtonLink>
            </>
          ) : (
            <>
              <h2 className="font-display text-card text-ivory">Start with a daily check-in.</h2>
              <p className="text-body text-muted">Your recorded values will appear here after you save an entry.</p>
              <ButtonLink href="/check-in/stress">Go to daily check-in</ButtonLink>
            </>
          )}
        </Card>
      </Slot>
      <Slot top={547}>
        <Card tone="glass" aria-labelledby="forecast-title" className="flex flex-col items-start gap-[7px] p-pad canvas:h-[210px] canvas:overflow-y-auto">
          <h2 id="forecast-title" className="font-display text-card leading-[1.17] text-ivory">Experimental fatigue estimate</h2>
          {forecast?.status === "ready" ? (
            <>
              <p className="font-display text-[56px] leading-[1.09] text-ivory">{Math.round(forecast.probability_high_fatigue * 100)}%</p>
              <p className="text-body-lg text-ivory">Chance of reporting high fatigue at your next check-in.</p>
              <p className="text-body text-muted">Trained on simulated data. Not medical advice.</p>
            </>
          ) : (
            <p role="status" className="text-body text-muted">
              {loading ? "Loading the forecast…" : forecast?.status === "insufficient_history"
                ? "At least three daily check-ins are needed. Your recorded values and checklist remain available."
                : "The forecast is currently unavailable. No probability has been invented."}
            </p>
          )}
        </Card>
      </Slot>
    </AppShell>
  );
}
