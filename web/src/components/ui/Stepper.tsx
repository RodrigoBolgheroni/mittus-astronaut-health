export type StepperStep = { label: string };

type StepperProps = {
  steps: readonly string[];
  /** 1-based indexes highlighted (cyan-18 + ivory). Review highlights 5 and 6 in Figma. */
  active: readonly number[];
};

/** Figma "Check-in steps": 6 pills of 158.667 x 44 (gap 10). Pills are not links in Figma. */
export function Stepper({ steps, active }: StepperProps) {
  return (
    <ol aria-label="Check-in progress" className="stepper grid gap-2.5">
      {steps.map((label, i) => {
        const on = active.includes(i + 1);
        return (
          <li
            key={label}
            aria-current={active[active.length - 1] === i + 1 ? "step" : undefined}
            className={`flex h-11 items-start rounded-step pl-[18px] pt-3 text-label whitespace-pre ${
              on ? "bg-cyan-18 text-ivory" : "bg-surface-32 text-muted"
            }`}
          >
            {`${i + 1}  ${label}`}
          </li>
        );
      })}
    </ol>
  );
}
