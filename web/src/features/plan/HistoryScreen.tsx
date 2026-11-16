"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

import { AppShell, Slot } from "@/components/shell/AppShell";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { StatusPill } from "@/components/ui/StatusPill";
import { listCheckInActions, listCheckIns, type CheckInAction } from "@/lib/api";
import circleCheck from "./assets/log-circle-check.svg";
import flag from "./assets/log-flag.svg";
import orbit from "./assets/log-orbit.svg";
import { COPY, ROW_STATUS, eventAt, formatLogDate, planStatus } from "./plan-model";

const ICON = { completed: circleCheck, dismissed: flag, superseded: orbit, suggested: flag, acknowledged: flag } as const;
const TONE = { completed: "cyan", suggested: "cyan", acknowledged: "cyan", dismissed: "purple", superseded: "purple" } as const;

type State = { items: CheckInAction[] | null; error: boolean };

/** Actions of the latest check-ins, newest first. */
async function loadHistory(): Promise<CheckInAction[]> {
  const { items } = await listCheckIns(10);
  const lists = await Promise.all(items.map((c) => listCheckInActions(c.id)));
  return lists
    .flatMap((l) => l.actions)
    .sort((a, b) => (eventAt(a) < eventAt(b) ? 1 : eventAt(a) > eventAt(b) ? -1 : 0));
}

/** Figma 16 "My plan · Action history" (32:498). */
export function HistoryScreen() {
  const [state, setState] = useState<State>({ items: null, error: false });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let live = true;
    loadHistory().then(
      (items) => live && setState({ items, error: false }),
      () => live && setState({ items: null, error: true }),
    );
    return () => {
      live = false;
    };
  }, [attempt]);
  const load = () => {
    setState({ items: null, error: false });
    setAttempt((n) => n + 1);
  };

  const loading = !state.items && !state.error;

  return (
    <AppShell active="plan" title="Action history." subtitle="Review tasks from previous check-ins.">
      <Slot top={207} width={648}>
        <div className="flex flex-col gap-[18px]">
          <Card aria-labelledby="log-title" className="flex flex-col gap-3 p-pad canvas:h-[330px]">
            <h2 id="log-title" className="font-display text-card text-ivory">
              Your mission log
            </h2>
            {state.error ? (
              <div role="alert" className="flex flex-col items-start gap-3">
                <p className="text-body text-ivory">{COPY.historyError}</p>
                <Button variant="secondary" onClick={load}>
                  Try again
                </Button>
              </div>
            ) : loading ? (
              <p role="status" aria-busy="true" className="text-body text-muted">
                Loading…
              </p>
            ) : state.items && state.items.length === 0 ? (
              <p className="text-body text-muted">{COPY.historyEmpty}</p>
            ) : (
              // Figma shows three 65px rows in the 330px card; older entries scroll inside it.
              <ul className="flex flex-col gap-3 canvas:min-h-0 canvas:flex-1 canvas:overflow-y-auto">
                {state.items?.map((a) => {
                  const s = planStatus(a.status);
                  return (
                    <li key={a.id} className="flex min-h-[65px] shrink-0 items-center gap-2.5">
                      <span className="flex h-[38px] w-[34px] shrink-0 items-center justify-center">
                        <Image src={s ? ICON[s] : flag} alt="" width={24} height={24} aria-hidden="true" unoptimized />
                      </span>
                      {/* Figma "Log entry" is 400px wide, so the status tag sits in a fixed column. */}
                      <div className="flex min-w-0 flex-1 flex-col gap-1 canvas:w-[400px] canvas:flex-none">
                        <p className="text-body-lg text-ivory">{a.title}</p>
                        <p className="text-pill text-muted">{formatLogDate(eventAt(a))}</p>
                      </div>
                      {s ? <StatusPill tone={TONE[s]}>{ROW_STATUS[s]}</StatusPill> : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
          <div>
            <ButtonLink variant="secondary" href="/plan" className="canvas:w-[240px]">
              Back to checklist
            </ButtonLink>
          </div>
        </div>
      </Slot>
    </AppShell>
  );
}
