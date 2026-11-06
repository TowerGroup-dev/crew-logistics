import { CrewWorkspace } from "@/components/crew-workspace";

/**
 * Shared schedule shell, Overview / Month / Year / List / Employees stay on one
 * mounted board so year→month (and filter state) do not hard-reset.
 */
export default function ScheduleLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <CrewWorkspace />
      {/* Route segments only drive the URL / metadata; UI comes from the shell. */}
      <div className="sr-only" aria-hidden>
        {children}
      </div>
    </>
  );
}
