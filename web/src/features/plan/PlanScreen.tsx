"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { AppShell, Slot } from "@/components/shell/AppShell";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { isApiError, useCheckInActions, useCheckIns, type CheckInActionStatus } from "@/lib/api";
import { taskTitleFor } from "@/lib/ceres/recommendation-cache";
import { ChecklistRow } from "./ChecklistRow";
import {
  CONTROLS,
  COPY,
  ROW_STATUS,
  SUBTITLE,
  conflictMessage,
  currentAction,
  latestCheckIn,
  planStatus,
  taskTitle,
} from "./plan-model";

type Phase = "idle" | "running" | "done" | "error";

const TITLE = "Your daily checklist.";
const CARD = "flex flex-col gap-3.5 p-pad canvas:min-h-[452px]";
const H2 = "font-display text-[32px] leading-[1.17] text-ivory";

/** Figma 10-13 "My plan" (30:371, 32:291, 32:334, 32:375) wired to the check-in actions API. */
export function PlanScreen() {
  const checkIns = useCheckIns(1);
  const latest = checkIns.data ? latestCheckIn(checkIns.data.items) : null;
  const actions = useCheckInActions(latest?.id);
  const { evaluate, refetch: refetchActions, update, updating, evaluation } = actions;
  const { refetch: refetchCheckIns } = checkIns;

  const [phase, setPhase] = useState<Phase>("idle");
  const [notice, setNotice] = useState<{ text: string; id: number } | null>(null);
  const evaluatedFor = useRef<string | null>(null);
  const noticeRef = useRef<HTMLParagraphElement>(null);
  const noticeSeq = useRef(0);

  const announce = useCallback((text: string) => setNotice({ text, id: ++noticeSeq.current }), []);

  const run = useCallback(async () => {
    setPhase("running");
    try {
      await evaluate();
      setPhase("done");
    } catch (e) {
      if (isApiError(e) && e.isConflict) {
        // The hook already refetched the list: the card shows the vigent action.
        announce(conflictMessage(e.code));
        if (e.code === "CHECK_IN_NOT_LATEST") void refetchCheckIns();
        setPhase("done");
      } else {
        setPhase("error");
      }
    }
  }, [evaluate, announce, refetchCheckIns]);

  const latestId = latest?.id;
  useEffect(() => {
    if (!latestId || evaluatedFor.current === latestId) return;
    evaluatedFor.current = latestId;
    void run();
  }, [latestId, run]);

  // Move focus to the result: the pressed button may disappear with the state change.
  useEffect(() => {
    if (notice) noticeRef.current?.focus();
  }, [notice]);

  const retry = () => {
    evaluatedFor.current = null;
    setPhase("idle");
    void refetchCheckIns();
    void refetchActions();
    if (latestId) {
      evaluatedFor.current = latestId;
      void run();
    }
  };

  const act = async (id: string, status: CheckInActionStatus) => {
    try {
      await update(id, status);
      announce(SUBTITLE[status]);
    } catch (e) {
      announce(isApiError(e) && e.isConflict ? conflictMessage(e.code) : COPY.updateFailed);
    }
  };

  // ---- state ----
  const initialLoading = checkIns.loading && !checkIns.data;
  const failed = (checkIns.error && !checkIns.data) || phase === "error" || (actions.error && !actions.data);
  const loading = !failed && (initialLoading || (latest && (phase === "idle" || phase === "running") && !actions.data));
  const empty = !failed && !loading && !latest;
  const current = !failed && !loading && !empty ? currentAction(actions.data ?? []) : null;
  const status = current ? planStatus(current.status) : null;
  const shown = status && status !== "superseded" ? status : null;
  const explanation = current && evaluation?.action?.id === current.id ? evaluation.explanation : null;
  const noAction = !failed && !loading && !empty && !current ? (evaluation?.explanation ?? null) : null;

  const subtitle = failed
    ? COPY.errorSubtitle
    : loading
      ? COPY.loadingSubtitle
      : empty
        ? COPY.emptySubtitle
        : shown
          ? SUBTITLE[shown]
          : COPY.noActionSubtitle;

  const checkedToday = Boolean(latest && checkIns.data && latest.check_in_date === checkIns.data.today);

  return (
    <AppShell active="plan" title={TITLE} subtitle={subtitle} overlay={shown === "suggested" ? "bg-72" : "bg-82"}>
      <Slot top={208}>
        {failed ? (
          <Card tone="glass" role="alert" className={CARD}>
            <h2 className={H2}>Today’s tasks</h2>
            <p className="text-body text-ivory">{COPY.errorBody}</p>
            <div>
              <Button onClick={retry} className="canvas:w-[180px]">
                Try again
              </Button>
            </div>
          </Card>
        ) : loading ? (
          <Card tone="glass" role="status" aria-busy="true" className={CARD}>
            <h2 className={H2}>Today’s tasks</h2>
            <p className="text-body text-muted">{COPY.loadingSubtitle}</p>
          </Card>
        ) : empty ? (
          <Card tone="glass" className={CARD}>
            <h2 className={H2}>Today’s tasks</h2>
            <p className="text-body text-ivory">{COPY.emptyBody}</p>
            <div>
              <ButtonLink href="/check-in/stress" className="canvas:w-[216px]">
                Daily check-in
              </ButtonLink>
            </div>
          </Card>
        ) : (
          <Card tone="glass" aria-labelledby="plan-title" className={CARD}>
            <h2 id="plan-title" className={H2}>
              Today’s tasks
            </h2>
            <p className="text-body leading-[1.17] text-ivory">Review your check-in and follow up on the suggested task.</p>
            <ul className="flex flex-col gap-3.5">
              <ChecklistRow
                complete={checkedToday}
                task="Save today’s check-in"
                status={checkedToday ? "Completed" : ""}
              />
              <ChecklistRow task="Review the check-in insight" status="Open insight ↗" href="/insights" />
              {current && status ? (
                <ChecklistRow
                  id="plan-task"
                  complete={status === "completed"}
                  task={current.title || taskTitleFor(current.check_in_id, current.action_code) || taskTitle(current.action_code)}
                  status={ROW_STATUS[status]}
                />
              ) : null}
            </ul>

            <p
              ref={noticeRef}
              tabIndex={-1}
              role="status"
              aria-live="polite"
              className={notice ? "text-body leading-[1.17] text-cyan outline-none" : "sr-only"}
            >
              {notice?.text ?? ""}
            </p>

            {current && (status === "suggested" || status === "acknowledged") ? (
              <div className="flex flex-wrap gap-3" role="group" aria-label="Task actions">
                {CONTROLS[status].map((c) => (
                  <Button
                    key={c.status}
                    variant={c.variant}
                    disabled={updating}
                    aria-describedby="plan-task"
                    onClick={() => void act(current.id, c.status)}
                    className={
                      c.label === "Got it"
                        ? "canvas:w-[180px]"
                        : c.label === "Dismiss"
                          ? "canvas:w-[140px]"
                          : status === "suggested"
                            ? "canvas:w-[186px]"
                            : "canvas:w-[194px]"
                    }
                  >
                    {c.label}
                  </Button>
                ))}
              </div>
            ) : current ? (
              <div>
                <ButtonLink href="/" className="canvas:w-[194px]">
                  Back to home
                </ButtonLink>
              </div>
            ) : null}

            {/* Backend text (`explanation`); not in Figma, shown below the controls. */}
            {explanation ?? noAction ? (
              <p className="text-body leading-[1.17] text-muted">{explanation ?? noAction}</p>
            ) : null}
          </Card>
        )}
      </Slot>
    </AppShell>
  );
}
