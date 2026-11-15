import { Suspense } from "react";

import { HistoryFallback, HistoryScreen } from "@/features/history/HistoryScreen";

// `/history` (sleep, Figma 30:132) and `/history?metric=fatigue` (Figma 36:502).
// The metric comes from useSearchParams, so the screen sits in a Suspense
// boundary (Cache Components); the fallback is the same shell in loading state.
export default function HistoryPage() {
  return (
    <Suspense fallback={<HistoryFallback />}>
      <HistoryScreen />
    </Suspense>
  );
}
