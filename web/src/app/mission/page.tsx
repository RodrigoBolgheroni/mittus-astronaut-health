import type { Metadata } from "next";
import { Suspense } from "react";

import { MissionScreen } from "@/features/mission/MissionScreen";

export const metadata: Metadata = { title: "Mission · Mittus" };

// Figma 08/09 (30:319, 32:237) and the zoom frames 26-28. Query: ?direction=return&focus=earth|spacecraft|moon.
export default function MissionPage() {
  return (
    <Suspense fallback={null}>
      <MissionScreen />
    </Suspense>
  );
}
