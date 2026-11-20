"use client";

import { useSyncExternalStore } from "react";

/** Same edge as Tailwind's `sm:` (640px): below it we lay things out for a phone. */
const PHONE_QUERY = "(max-width: 639px)";

function subscribe(onChange: () => void) {
  if (typeof window === "undefined" || !window.matchMedia) return () => {};
  const query = window.matchMedia(PHONE_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/** True on a phone-width screen (updates when the phone turns or the window resizes). */
export function useIsPhone() {
  return useSyncExternalStore(
    subscribe,
    () => (typeof window !== "undefined" && window.matchMedia ? window.matchMedia(PHONE_QUERY).matches : false),
    () => false,
  );
}
