import Image from "next/image";

/** Icons exported from Figma (Lucide). Sizes are the Figma root sizes. */
const ICONS = {
  logo: ["logo-mittus", 26, 27],
  house: ["house", 25, 25],
  "clipboard-check": ["clipboard-check", 25, 25],
  history: ["chart-no-axes-combined", 25, 25],
  sparkles: ["sparkles", 25, 25],
  orbit: ["orbit", 25, 25],
  flag: ["flag", 25, 25],
  "activity-32": ["activity", 32, 32],
  "sparkles-32": ["sparkles-32", 32, 32],
  "orbit-32": ["orbit-32", 32, 32],
  "moon-32": ["moon-32", 32, 32],
  "activity-22": ["activity-22", 22, 22],
  "sparkles-22": ["sparkles-22", 22, 22],
  "orbit-22": ["orbit-22", 22, 22],
  "moon-22": ["moon-22", 22, 22],
  "moon-22-review": ["moon-22-review", 22, 22],
  "moon-24": ["moon-24", 24, 24],
  "clipboard-list": ["clipboard-list", 24, 24],
  "clipboard-list-32": ["clipboard-list-32", 32, 32],
  laugh: ["laugh", 30, 30],
  "smile-plus": ["smile-plus", 30, 30],
  smile: ["smile", 30, 30],
  meh: ["meh", 30, 30],
  frown: ["frown", 30, 30],
  annoyed: ["annoyed", 30, 30],
  angry: ["angry", 30, 30],
  "laugh-selected": ["laugh-selected", 26, 26],
  "smile-selected": ["smile-selected", 26, 26],
  "meh-selected": ["meh-selected", 26, 26],
  // Derived from the 30px icons by exact scaling (same stroke colour as the Figma 26px ones).
  "frown-selected": ["frown-selected", 26, 26],
  "angry-selected": ["angry-selected", 26, 26],
  "annoyed-selected": ["annoyed-selected", 26, 26],
  "smile-plus-selected": ["smile-plus-selected", 26, 26],
  "circle-check": ["circle-check", 72, 72],
  "circle-x-60": ["circle-x-60", 60, 60],
  "circle-x-64": ["circle-x-64", 64, 64],
  "loader-circle": ["loader-circle", 64, 64],
  hotspot: ["hotspot-ellipse", 22, 22],
  "square-18": ["square-18", 18, 18],
  // Checked state of the Figma 18px square (not drawn in Figma; Lucide square-check at 18px).
  "square-check-18": ["square-check-18", 18, 18],
} as const;

export type IconName = keyof typeof ICONS;

type IconProps = { name: IconName; className?: string };

/** Decorative icon (aria-hidden). Keeps the exported SVG width/height. */
export function Icon({ name, className }: IconProps) {
  const [file, width, height] = ICONS[name];
  return (
    <Image
      src={`/design/icons/${file}.svg`}
      alt=""
      width={width}
      height={height}
      aria-hidden="true"
      unoptimized
      className={`max-w-none shrink-0 ${className ?? ""}`}
    />
  );
}
