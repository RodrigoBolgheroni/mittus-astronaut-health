import type { ElementType, HTMLAttributes } from "react";

type CardProps = HTMLAttributes<HTMLElement> & {
  /** Only used when rendered `as` a link. */
  href?: string;
  as?: ElementType;
  /** "scale" = surface-12 + line-65 (check-in cards); "glass" = glass fill + line. */
  tone?: "scale" | "glass";
};

const TONE = {
  scale: "bg-surface-12 border-line-65",
  glass: "bg-glass border-line",
} as const;

/** Rounded 28px panel with 1px border (Figma card). */
export function Card({ as: Tag = "div", tone = "scale", className = "", ...rest }: CardProps) {
  return <Tag className={`glass rounded-card border border-solid ${TONE[tone]} ${className}`} {...rest} />;
}
