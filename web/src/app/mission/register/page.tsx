import type { Metadata } from "next";

import { RegisterMissionScreen } from "@/features/mission/RegisterMissionScreen";

export const metadata: Metadata = { title: "Register a mission · Mittus" };

// Figma "Mission · Register a mission" (111:1728); the Mission nav item opens it.
export default function RegisterMissionPage() {
  return <RegisterMissionScreen />;
}
