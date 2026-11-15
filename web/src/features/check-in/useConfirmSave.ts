"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";

import { useCheckIn } from "./CheckInProvider";
import { SAVED_PATH } from "./scales";

/** Saves today's check-in and moves to the Saved screen on success (errors show the Save error state). */
export function useConfirmSave() {
  const { save } = useCheckIn();
  const router = useRouter();
  return useCallback(async () => {
    if (await save()) router.push(SAVED_PATH);
  }, [save, router]);
}
