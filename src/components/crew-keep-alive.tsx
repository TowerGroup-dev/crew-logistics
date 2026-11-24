"use client";

import { memo, type ReactNode } from "react";

/**
 * Keeps a tab's view mounted but stops it re-rendering while it is hidden.
 * The board re-renders on every change (typing, saving, switching tabs), and
 * without this the hidden Month / Year / Overview views redrew each time.
 * When the tab becomes active again it renders once with the latest data.
 *
 * `live`: keep updating while hidden (CSS hide only). Use for Month so opening
 * Calendar is an instant show — no thaw/recolour flash.
 */
const Frozen = memo(
  function Frozen({ children }: { active: boolean; children: ReactNode }) {
    return <>{children}</>;
  },
  (_prev, next) => !next.active,
);

export function KeepAlive({
  active,
  children,
  live = false,
}: {
  active: boolean;
  children: ReactNode;
  live?: boolean;
}) {
  return (
    <div className={active ? "contents" : "hidden"}>
      {live ? children : <Frozen active={active}>{children}</Frozen>}
    </div>
  );
}
