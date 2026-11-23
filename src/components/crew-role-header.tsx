import type { CSSProperties, MouseEvent, ReactNode } from "react";
import { cn } from "@/lib/cn";

/** Compact role divider, a notch above body text, not a banner. */
export function CrewRoleHeader({
  role,
  count,
  className,
  spaced,
  onClick,
  onContextMenu,
  leading,
  trailing,
  style,
}: {
  role: string;
  count?: number;
  className?: string;
  spaced?: boolean;
  onClick?: () => void;
  onContextMenu?: (event: MouseEvent) => void;
  leading?: ReactNode;
  trailing?: ReactNode;
  style?: CSSProperties;
}) {
  const classNames = cn(
    "flex w-full border-b border-border bg-slate-100 px-4 py-1.5 pl-5 text-left",
    spaced && "mt-3",
    onClick && "cursor-pointer hover:bg-slate-200/80",
    className,
  );
  const body = (
    <div className="flex min-w-0 flex-1 items-center justify-between gap-2">
      <div className="flex min-w-0 items-center gap-1.5">
        {leading}
        <p className="truncate text-sm font-bold tracking-wide text-slate-900">{role}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {count != null ? <span className="text-[0.8125rem] font-medium text-slate-600">{count}</span> : null}
        {trailing}
      </div>
    </div>
  );
  if (onClick) {
    return (
      <button type="button" onClick={onClick} onContextMenu={onContextMenu} className={classNames} style={style}>
        {body}
      </button>
    );
  }
  return (
    <div className={classNames} style={style} onContextMenu={onContextMenu}>
      {body}
    </div>
  );
}
