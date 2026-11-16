import Link from "next/link";

import { Icon, type IconName } from "@/components/ui/Icon";

export type NavId = "home" | "checkin" | "history" | "insights" | "mission" | "plan";

const ITEMS: { id: NavId; href: string; label: string; icon: IconName }[] = [
  { id: "home", href: "/", label: "Home", icon: "house" },
  { id: "checkin", href: "/check-in/stress", label: "Check-in", icon: "clipboard-check" },
  { id: "history", href: "/history", label: "History", icon: "history" },
  { id: "insights", href: "/insights", label: "Insights", icon: "sparkles" },
  { id: "mission", href: "/mission/register", label: "Mission", icon: "orbit" },
  { id: "plan", href: "/plan", label: "Plan", icon: "flag" },
];

/** Figma Mittus/Navigation (100 x 708). Below 1280px it becomes a horizontal bar. */
export function Navigation({ active }: { active: NavId }) {
  return (
    <nav
      aria-label="Main"
      className="flex flex-row flex-wrap items-center justify-center gap-x-[13px] gap-y-2 canvas:gap-y-[13px] glass rounded-nav border border-solid border-line bg-glass px-4 py-3
        canvas:absolute canvas:left-(--nav-x) canvas:top-(--nav-y) canvas:h-(--nav-height) canvas:w-(--nav-width)
        canvas:flex-col canvas:flex-nowrap canvas:justify-start canvas:px-0 canvas:pb-0 canvas:pt-pad"
    >
      <Icon name="logo" />
      <span className="font-display text-brand text-ivory">Mittus</span>
      <ul className="flex flex-row gap-1 canvas:flex-col canvas:gap-[13px]">
        {ITEMS.map((item) => (
          <li key={item.id}>
            <Link
              href={item.href}
              aria-label={item.label}
              aria-current={item.id === active ? "page" : undefined}
              className={`flex h-[57px] w-[60px] items-center justify-center rounded-item ${
                item.id === active ? "bg-cyan-17" : "hover:bg-cyan-13"
              }`}
            >
              <Icon name={item.icon} />
            </Link>
          </li>
        ))}
      </ul>
      <span className="text-micro text-muted">DEMO</span>
    </nav>
  );
}
