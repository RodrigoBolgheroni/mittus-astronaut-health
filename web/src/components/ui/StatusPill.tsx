type StatusPillProps = {
  tone?: "purple" | "cyan";
  children: string;
  className?: string;
};

const TONE = { purple: "bg-purple-13 text-purple", cyan: "bg-cyan-13 text-cyan" } as const;

/** Figma "Status · ..." pill (e.g. SIMULATED DATA). */
export function StatusPill({ tone = "purple", children, className = "" }: StatusPillProps) {
  return (
    <p
      className={`inline-block w-fit rounded-tag px-3 py-1.5 text-pill whitespace-nowrap ${TONE[tone]} ${className}`}
    >
      {children}
    </p>
  );
}
