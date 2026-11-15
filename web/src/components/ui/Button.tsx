import Link from "next/link";
import type { ComponentPropsWithRef } from "react";

export type ButtonVariant = "primary" | "accent" | "secondary" | "quiet";

// Figma: Mittus/Button/{Primary,Secondary,Quiet,Accent}. Hover/pressed/disabled
// are not designed: derived with opacity only (see docs/design/implementation-notes.md).
const VARIANT: Record<ButtonVariant, string> = {
  primary: "bg-cyan text-bg",
  accent: "bg-purple text-bg",
  secondary: "bg-surface text-ivory border border-solid border-line",
  quiet: "bg-bg text-muted",
};

const BASE =
  "inline-flex h-12 items-center justify-center rounded-pill px-6 text-body whitespace-nowrap " +
  "transition-opacity hover:opacity-90 active:opacity-75 disabled:cursor-not-allowed disabled:opacity-40";

export function buttonClass(variant: ButtonVariant = "primary", className = "") {
  return `${BASE} ${VARIANT[variant]} ${className}`;
}

type ButtonProps = { variant?: ButtonVariant } & ComponentPropsWithRef<"button">;

export function Button({ variant = "primary", className, type = "button", ...rest }: ButtonProps) {
  return <button type={type} className={buttonClass(variant, className)} {...rest} />;
}

type ButtonLinkProps = { variant?: ButtonVariant; href: string } & Omit<ComponentPropsWithRef<"a">, "href">;

/** Link styled as a button. */
export function ButtonLink({ variant = "primary", className, href, ...rest }: ButtonLinkProps) {
  return <Link href={href} className={buttonClass(variant, className)} {...rest} />;
}
