/** Color tokens. Values mirror `@theme` in src/app/globals.css. */
export const colors = {
  bg: "#0b0d12",
  surface: "#181c25",
  line: "#525865",
  ivory: "#fffce8",
  muted: "#b8bdcb",
  cyan: "#00c3d0",
  purple: "#c35df3",
  "bg-82": "rgba(11, 13, 18, 0.82)",
  "bg-72": "rgba(11, 13, 18, 0.72)",
  "cyan-17": "rgba(0, 195, 208, 0.17)",
  "cyan-18": "rgba(0, 195, 208, 0.18)",
  "cyan-13": "rgba(0, 195, 208, 0.13)",
  "purple-13": "rgba(195, 93, 243, 0.13)",
  "surface-12": "rgba(24, 28, 37, 0.12)",
  "surface-32": "rgba(24, 28, 37, 0.32)",
  "surface-50": "rgba(24, 28, 37, 0.5)",
  "line-65": "rgba(82, 88, 101, 0.65)",
  glass: "rgba(24, 28, 37, 0.1)",
} as const;

export type ColorToken = keyof typeof colors;

/** CSS variable reference for a color token. */
export const colorVar = (token: ColorToken) => `var(--color-${token})` as const;
