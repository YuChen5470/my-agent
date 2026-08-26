"use client";

import { useSyncExternalStore } from "react";

/** Subscribes to nothing; only the server/client snapshot split is wanted. */
const noSubscribe = () => () => {};
const clientSnapshot = () => true;
const serverSnapshot = () => false;

/**
 * False while the server renders and through hydration, true afterwards.
 *
 * `useSyncExternalStore` is what makes that safe: React is required to use the
 * server snapshot for the hydrating render, so the first client pass matches
 * the HTML exactly, and the switch happens in the re-render after.
 *
 * Use it to gate anything that cannot exist on the server — a stored session,
 * the current time — rather than reading those during render and hoping the
 * markup happens to match.
 */
export function useIsHydrated(): boolean {
  return useSyncExternalStore(noSubscribe, clientSnapshot, serverSnapshot);
}
