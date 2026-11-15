import type { Metadata } from "next";
import { Cormorant } from "next/font/google";
import "./globals.css";

// Cormorant Medium (500) for headings and numbers. SF Pro is a system font and
// is not bundled: see --font-sans in globals.css.
const cormorant = Cormorant({
  variable: "--font-cormorant",
  subsets: ["latin"],
  weight: "500",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Mittus",
  description: "Crew wellbeing check-in (simulated data).",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${cormorant.variable} h-full`}>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
