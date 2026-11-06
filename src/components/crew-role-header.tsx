import { cn } from "@/lib/cn";

/** Compact role divider, a notch above body text, not a banner. */
export function CrewRoleHeader({
  role,
  count,
  className,
  spaced,
}: {
  role: string;
  count?: number;
  className?: string;
  spaced?: boolean;
}) {
  return (
    <div
      className={cn(
        "border-b border-border bg-slate-100 px-4 py-1.5",
        spaced && "mt-2",
        className,
      )}
    >
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[13px] font-semibold text-slate-800">{role}</p>
        {count != null ? <span className="text-[11px] text-muted-foreground">{count}</span> : null}
      </div>
    </div>
  );
}
