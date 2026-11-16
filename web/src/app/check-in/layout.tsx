import type { ReactNode } from "react";

import { CheckInProvider } from "@/features/check-in/CheckInProvider";

// One provider for the whole flow so answers survive step navigation.
export default function CheckInLayout({ children }: { children: ReactNode }) {
  return <CheckInProvider>{children}</CheckInProvider>;
}
