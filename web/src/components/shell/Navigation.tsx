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

/**
 * Figma Mittus/Navigation (100 x 708) at >= 1280px. Below it: a compact brand
 * bar on top and a fixed tab bar at the bottom (six equal columns, so the items
 * never wrap or overflow on a phone). The glass lives on each piece, not on the
 * <nav>: `backdrop-filter` would make the <nav> the containing block of the
 * fixed tab bar.
 */
export function Navigation({ active }: { active: NavId }) {
  return (
    <nav
      aria-label="Main"
      className="flex items-center gap-x-[13px] rounded-nav border border-solid border-line bg-glass px-4 py-2
        canvas:glass canvas:absolute canvas:left-(--nav-x) canvas:top-(--nav-y) canvas:h-(--nav-height) canvas:w-(--nav-width)
        canvas:flex-col canvas:gap-y-[13px] canvas:px-0 canvas:pb-0 canvas:pt-pad"
    >
      <Icon name="logo" />
      <span className="font-display text-brand text-ivory">Mittus</span>
      <ul
        className="flex flex-col gap-[13px]
          max-canvas:glass max-canvas:fixed max-canvas:inset-x-0 max-canvas:bottom-0 max-canvas:z-40 max-canvas:grid
          max-canvas:grid-cols-6 max-canvas:gap-1 max-canvas:border-t max-canvas:border-solid max-canvas:border-line
          max-canvas:bg-bg-82 max-canvas:px-2 max-canvas:pt-2 max-canvas:pb-[max(8px,env(safe-area-inset-bottom))]"
      >
        {ITEMS.map((item) => (
          <li key={item.id} className="min-w-0">
            <Link
              href={item.href}
              aria-label={item.label}
              aria-current={item.id === active ? "page" : undefined}
              className={`flex h-14 w-full flex-col items-center justify-center gap-0.5 rounded-item
                canvas:h-[57px] canvas:w-[60px] canvas:gap-0 ${item.id === active ? "bg-cyan-17" : "hover:bg-cyan-13"}`}
            >
              <Icon name={item.icon} />
              <span
                aria-hidden="true"
                className={`truncate text-[11px] leading-none canvas:hidden ${item.id === active ? "text-ivory" : "text-muted"}`}
              >
                {item.label}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <span className="ml-auto text-micro text-muted canvas:ml-0">DEMO</span>
    </nav>
  );
}
