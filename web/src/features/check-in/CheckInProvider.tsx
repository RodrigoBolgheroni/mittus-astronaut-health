"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { getCheckInOptions, putCheckIn, type CheckIn, type PutCheckInBody } from "@/lib/api";
import { mergeBackendLabels, SCALES, type ScaleDef, type ScaleId } from "./scales";

export type Answers = {
  stress: number;
  mood: number;
  team: number;
  fatigue: number;
  sleepHours: number;
  description: string;
};

/**
 * Initial selection mirrors the Figma mocks (3 / 3 / 1 / 3, sleep 6.5 h).
 * PENDING: product decision on whether nothing should be preselected.
 */
export const DEFAULT_ANSWERS: Answers = { stress: 3, mood: 3, team: 1, fatigue: 3, sleepHours: 6.5, description: "" };

/** Fixed fallback shown for any save failure (replaces raw network/API messages). */
export const SAVE_ERROR_MESSAGE = "We couldn't save your check-in. Please try again.";

export type SaveStatus = "idle" | "saving" | "error" | "saved";

type CheckInFlow = {
  answers: Answers;
  setAnswer: <K extends keyof Answers>(key: K, value: Answers[K]) => void;
  scales: Record<ScaleId, ScaleDef>;
  status: SaveStatus;
  saved: CheckIn | null;
  /** Backend validation / network message for the error state (not shown in Figma). */
  errorDetail: string | null;
  /** Discard confirmation (Figma 69:2370) is showing. */
  discardOpen: boolean;
  askDiscard: () => void;
  keepEditing: () => void;
  /** Resets the flow. */
  reset: () => void;
  /** PUT today's (UTC) check-in. Resolves true on success. */
  save: () => Promise<boolean>;
};

const Ctx = createContext<CheckInFlow | null>(null);

export const utcToday = () => new Date().toISOString().slice(0, 10);

export function toBody(a: Answers): PutCheckInBody {
  const description = a.description.trim();
  return {
    sleep_hours: a.sleepHours,
    stress_level: a.stress,
    mood_level: a.mood,
    team_conflict_level: a.team,
    fatigue: a.fatigue,
    ...(description ? { description } : {}),
  };
}

export function CheckInProvider({ children }: { children: ReactNode }) {
  const [answers, setAnswers] = useState<Answers>(DEFAULT_ANSWERS);
  const [scales, setScales] = useState(SCALES);
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [saved, setSaved] = useState<CheckIn | null>(null);
  const [errorDetail, setErrorDetail] = useState<string | null>(null);
  const [discardOpen, setDiscardOpen] = useState(false);

  // Prefer the labels served by the backend; Figma labels are the fallback.
  useEffect(() => {
    let cancelled = false;
    getCheckInOptions()
      .then((options) => {
        if (cancelled) return;
        const merged = mergeBackendLabels(options);
        setScales(merged.scales);
        if (merged.divergences.length > 0) {
          console.warn("[check-in] label divergences between Figma and backend:", merged.divergences);
        }
      })
      .catch(() => {
        /* offline / backend down: keep the Figma labels */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const setAnswer = useCallback<CheckInFlow["setAnswer"]>((key, value) => {
    setAnswers((prev) => ({ ...prev, [key]: value }));
  }, []);

  const reset = useCallback(() => {
    setAnswers(DEFAULT_ANSWERS);
    setStatus("idle");
    setSaved(null);
    setErrorDetail(null);
    setDiscardOpen(false);
  }, []);

  const save = useCallback(async () => {
    setStatus("saving");
    setErrorDetail(null);
    try {
      const result = await putCheckIn(utcToday(), toBody(answers));
      setSaved(result);
      setStatus("saved");
      return true;
    } catch {
      setErrorDetail(SAVE_ERROR_MESSAGE);
      setStatus("error");
      return false;
    }
  }, [answers]);

  const value = useMemo<CheckInFlow>(
    () => ({
      answers,
      setAnswer,
      scales,
      status,
      saved,
      errorDetail,
      discardOpen,
      askDiscard: () => setDiscardOpen(true),
      keepEditing: () => setDiscardOpen(false),
      reset,
      save,
    }),
    [answers, setAnswer, scales, status, saved, errorDetail, discardOpen, reset, save],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCheckIn(): CheckInFlow {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useCheckIn must be used inside <CheckInProvider>");
  return ctx;
}
