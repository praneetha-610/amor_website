"use client";

import { useEffect, useSyncExternalStore } from "react";
import type { AvailabilityPayload } from "@/lib/inventory";

/**
 * One shared poller for the whole page. Every component that shows inventory
 * subscribes here, so we make a single request every 20s (only while the tab
 * is visible). The numbers always come from /api/availability (the database).
 */
let current: AvailabilityPayload | null = null;
let lastInitial: AvailabilityPayload | null = null;
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;
let inflight = false;

const emit = () => listeners.forEach((l) => l());

export async function refreshAvailability(): Promise<AvailabilityPayload | null> {
  if (inflight) return current;
  inflight = true;
  try {
    const res = await fetch("/api/availability", { cache: "no-store" });
    if (res.ok) {
      current = (await res.json()) as AvailabilityPayload;
      emit();
    }
  } catch {
    /* keep showing the last known numbers */
  } finally {
    inflight = false;
  }
  return current;
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  if (!timer) {
    timer = setInterval(() => {
      if (document.visibilityState === "visible") void refreshAvailability();
    }, 20_000);
  }
  return () => {
    listeners.delete(cb);
    if (!listeners.size && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}

export function useAvailability(initial: AvailabilityPayload): AvailabilityPayload {
  if (initial !== lastInitial) {
    lastInitial = initial;
    current = initial;
  }
  const data = useSyncExternalStore(
    subscribe,
    () => current ?? initial,
    () => initial,
  );
  useEffect(() => {
    const onVisible = () => document.visibilityState === "visible" && void refreshAvailability();
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);
  return data;
}
