import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

import squareCheck from "./assets/square-check.svg";
import square from "./assets/square.svg";

type Props = {
  id?: string;
  complete?: boolean;
  task: string;
  status: string;
  /** Row is a link (Figma "Open insight ↗" row has cursor pointer). */
  href?: string;
  children?: ReactNode;
};

const ROW =
  "flex min-h-[60px] items-center justify-between gap-3 rounded-[12px] border border-solid border-line bg-glass px-[14px] py-2";

/** Figma "Mittus / Checklist row" (110:1852): 954 x 60, icon 24, task 17, status 15. */
export function ChecklistRow({ id, complete = false, task, status, href, children }: Props) {
  const body: ReactNode = (
    <>
      <Image src={complete ? squareCheck : square} alt="" width={24} height={24} aria-hidden="true" unoptimized className="shrink-0" />
      <span id={id} className="min-w-0 flex-1 text-body-lg text-ivory canvas:max-w-[560px]">
        {task}
      </span>
      <span className="text-body text-right text-ivory canvas:w-[240px]">{status}</span>
    </>
  );
  return (
    <li>
      {href ? (
        <Link href={href} className={`${ROW} transition-opacity hover:opacity-90`}>
          {body}
        </Link>
      ) : (
        <div className={ROW}>{body}</div>
      )}
      {children}
    </li>
  );
}
