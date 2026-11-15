/** Spacing and canvas geometry (px). Mirrors `@theme` / `:root` in globals.css. */
export const spacing = { gap: 16, pad: 24 } as const;

export const canvas = {
  width: 1280,
  height: 832,
  contentX: 188,
  contentWidth: 1002,
  navX: 44,
  navY: 61,
  navWidth: 100,
  navHeight: 708,
  headingY: 48,
  pillX: 1030,
  pillY: 52,
  footerY: 784,
  footerWidth: 1030,
} as const;
