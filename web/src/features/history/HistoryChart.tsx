import type { ChartModel } from "./history-data";

/**
 * Figma "pink-60" (rgba(228, 37, 107, 0.6)), the fatigue bar fill in 36:502.
 * The variable is not in src/tokens / globals.css yet (shared files, not
 * edited here): PENDING add `--color-pink-60` to the tokens and use it.
 */
const FATIGUE_BAR = "rgba(228, 37, 107, 0.6)";

const FILL = {
  sleep: "var(--color-purple)",
  fatigue: FATIGUE_BAR,
  latest: "var(--color-cyan)",
} as const;

type HistoryChartProps = {
  model: ChartModel;
  /** Accessible name of the data table (visually hidden). */
  tableCaption: string;
  valueHeader: string;
};

/**
 * Seven-day bar chart (Figma "Chart bars", 952 x 172: 7 columns of 58,
 * value 12 ivory / 32-wide bar radius 8 / date 11 muted). The bars are SVG and
 * hidden from assistive tech; the same values are in a visually hidden <table>.
 */
export function HistoryChart({ model, tableCaption, valueHeader }: HistoryChartProps) {
  return (
    <>
      <div aria-hidden="true" className="flex h-[172px] w-full items-end justify-between overflow-hidden">
        {model.points.map((point) => (
          <div key={point.date} className="flex h-full w-[58px] min-w-0 flex-col items-center justify-end gap-1">
            <p className="text-pill whitespace-nowrap text-ivory">{point.valueLabel}</p>
            <svg width="32" height={point.heightPx} viewBox={`0 0 32 ${point.heightPx}`} className="block shrink-0">
              <rect
                width="32"
                height={point.heightPx}
                rx="8"
                fill={point.latest ? FILL.latest : FILL[model.metric]}
              />
            </svg>
            <p className="text-eyebrow whitespace-nowrap text-muted">{point.axisLabel}</p>
          </div>
        ))}
      </div>
      <table className="sr-only">
        <caption>{tableCaption}</caption>
        <thead>
          <tr>
            <th scope="col">Date</th>
            <th scope="col">{valueHeader}</th>
          </tr>
        </thead>
        <tbody>
          {model.points.map((point) => (
            <tr key={point.date}>
              <th scope="row">{point.longDate}</th>
              <td>{point.valueLabel}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
