type MetricProps = { label: string; value: string; detail: string };

/** Figma Mittus/Metric (215 x 154 on Home). */
export function Metric({ label, value, detail }: MetricProps) {
  return (
    <div className="flex flex-col gap-[5px] glass rounded-card border border-solid border-line bg-glass pl-pad pt-5 canvas:h-[154px] canvas:w-[215px]">
      <p className="text-label text-muted">{label}</p>
      <p className="font-display text-metric text-ivory">{value}</p>
      <p className="text-pill text-muted">{detail}</p>
    </div>
  );
}
