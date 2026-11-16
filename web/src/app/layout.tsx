import type { Metadata } from "next";
import { Cormorant, Inter } from "next/font/google";
import "./globals.css";

// Cormorant Medium (500) for headings and numbers. SF Pro is an Apple system
// font and cannot be bundled; Inter stands in for it elsewhere (--font-sans).
const cormorant = Cormorant({
  variable: "--font-cormorant",
  subsets: ["latin"],
  weight: "500",
  display: "swap",
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: "400",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Mittus",
  description: "Crew wellbeing check-in (simulated data).",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${cormorant.variable} ${inter.variable} h-full`}>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
