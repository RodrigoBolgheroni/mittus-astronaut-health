"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  evaluateCheckInActions,
  getCheckInOptions,
  getMissionContext,
  listCheckIns,
  listCheckInActions,
  updateCheckInAction,
} from "./client.ts";
import type {
  CheckIn,
  CheckInAction,
  CheckInActionStatus,
  CheckInOptions,
  EvaluateActionsResult,
  ListCheckIns,
  MissionContext,
  MissionPhase,
} from "./types.ts";

export type AsyncState<T> = {
  data: T | null;
  error: Error | null;
  loading: boolean;
};

export type AsyncResource<T> = AsyncState<T> & { refetch: () => Promise<void> };

function toError(e: unknown): Error {
  return e instanceof Error ? e : new Error(String(e));
}

function useResource<T>(load: () => Promise<T>, enabled = true): AsyncResource<T> {
  const [state, setState] = useState<AsyncState<T>>({ data: null, error: null, loading: enabled });
  const loadRef = useRef(load);
  loadRef.current = load;
  const run = useCallback(async (isCurrent: () => boolean) => {
    setState((s) => ({ ...s, error: null, loading: true }));
    try {
      const data = await loadRef.current();
      if (isCurrent()) setState({ data, error: null, loading: false });
    } catch (e) {
      if (isCurrent()) setState((s) => ({ data: s.data, error: toError(e), loading: false }));
    }
  }, []);
  const tokenRef = useRef(0);
  const refetch = useCallback(() => {
    const token = ++tokenRef.current;
    return run(() => token === tokenRef.current);
  }, [run]);
  // `load` identity is controlled by callers through the key deps below.
  useEffect(() => {
    if (!enabled) return;
    void refetch();
    const invalidate = () => {
      tokenRef.current += 1;
    };
    return invalidate;
  }, [enabled, refetch, load]);
  return { ...state, refetch };
}

export function useCheckIns(limit?: number): AsyncResource<ListCheckIns> {
  const load = useCallback(() => listCheckIns(limit), [limit]);
  return useResource(load);
}

export function useCheckInOptions(): AsyncResource<CheckInOptions> {
  return useResource(getCheckInOptions);
}

export function useMissionContext(phase: MissionPhase): AsyncResource<MissionContext> {
  const load = useCallback(() => getMissionContext(phase), [phase]);
  return useResource(load);
}

export type CheckInActionsHook = AsyncResource<CheckInAction[]> & {
  evaluating: boolean;
  evaluation: EvaluateActionsResult | null;
  updating: boolean;
  /** Rejects with ApiError (check `status === 409`); list is refetched on 409. */
  evaluate: () => Promise<EvaluateActionsResult>;
  update: (actionId: string, status: CheckInActionStatus) => Promise<CheckInAction>;
};

/** Pass null/undefined while no check-in id is known (no request is made). */
export function useCheckInActions(checkInId: string | null | undefined): CheckInActionsHook {
  const load = useCallback(
    async () => (checkInId ? (await listCheckInActions(checkInId)).actions : []),
    [checkInId],
  );
  const resource = useResource(load, Boolean(checkInId));
  const { refetch } = resource;
  const [evaluating, setEvaluating] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [evaluation, setEvaluation] = useState<EvaluateActionsResult | null>(null);

  const evaluate = useCallback(async () => {
    if (!checkInId) throw new Error("No check-in selected");
    setEvaluating(true);
    try {
      const result = await evaluateCheckInActions(checkInId);
      setEvaluation(result);
      await refetch();
      return result;
    } catch (e) {
      // On conflict the current state may differ; refresh the list.
      if ((e as { status?: number }).status === 409) await refetch();
      throw e;
    } finally {
      setEvaluating(false);
    }
  }, [checkInId, refetch]);

  const update = useCallback(
    async (actionId: string, status: CheckInActionStatus) => {
      setUpdating(true);
      try {
        const updated = await updateCheckInAction(actionId, status);
        await refetch();
        return updated;
      } catch (e) {
        if ((e as { status?: number }).status === 409) await refetch();
        throw e;
      } finally {
        setUpdating(false);
      }
    },
    [refetch],
  );

  return { ...resource, data: checkInId ? resource.data : [], evaluating, evaluation, updating, evaluate, update };
}

export type { CheckIn };
