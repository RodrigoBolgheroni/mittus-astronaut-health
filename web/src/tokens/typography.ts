/**
 * Typography. Display = Cormorant Medium (500), loaded with next/font in
 * app/layout.tsx. Text = SF Pro Regular (400): a system font, so it is not
 * bundled; the fallback stack resolves to SF Pro on Apple platforms and to the
 * platform UI font elsewhere. Letter-spacing is 0 everywhere in the design.
 */
export const fontFamily = {
  display: "var(--font-display)",
  sans: "var(--font-sans)",
} as const;

/** Font sizes in px, keyed by the `text-*` utility suffix. */
export const fontSize = {
  title: 48,
  success: 40,
  feedback: 38,
  metric: 36,
  section: 30,
  card: 28,
  "hours-title": 27,
  brand: 24,
  option: 22,
  value: 20,
  "body-lg": 17,
  "body-md": 16,
  body: 15,
  label: 14,
  caption: 13,
  pill: 12,
  eyebrow: 11,
  micro: 10,
} as const;

export const fontWeight = { display: 500, sans: 400 } as const;
