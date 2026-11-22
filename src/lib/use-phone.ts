"use client";

import { useSyncExternalStore } from "react";

/** Same edges as `sm:` in globals.css: narrow (under 640px) or short (under 512px, a phone turned sideways). */
const PHONE_QUERY = "(max-width: 639px), (max-height: 511px)";

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
