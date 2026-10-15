"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useSyncExternalStore } from "react";
import type { BurgerKey } from "@/config/site";
import type { AvailabilityPayload } from "@/lib/inventory";
import { statusFor } from "./inventory-copy";

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

/**
 * Instantly reflect a booking we just made (before the next poll / page change), so the
 * count visibly drops. The server's number replaces this on the very next refresh.
 */
export function applyLocalBooking(burger: BurgerKey, date: string, quantity: number) {
  if (!current) return;
  current = {
    ...current,
    days: current.days.map((d) => {
      if (d.date !== date) return d;
      const b = d.burgers[burger];
      const remaining = Math.max(0, b.remaining - quantity);
      return { ...d, burgers: { ...d.burgers, [burger]: { ...b, claimed: b.limit - remaining, remaining, status: statusFor(remaining, b.limit) } } };
    }),
  };
  emit();
  void refreshAvailability();
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  if (!timer) {
    timer = setInterval(() => {
      if (document.visibilityState === "visible") void refreshAvailability();
    }, 10_000);
  }
  return () => {
    listeners.delete(cb);
    if (!listeners.size && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}

/** The daily limits as seen in a payload, e.g. "30|30" — used to notice when the owner changes them. */
const limitSignature = (p: AvailabilityPayload) =>
  p.days[0] ? `${p.days[0].burgers.cheese.limit}|${p.days[0].burgers.nashville.limit}` : "";
let refreshedFor = "";

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
  // When the owner changes the daily limit, re-render the server-written wording too
  // ("30 BURGERS / DAY", page titles…) without losing what the customer typed.
  const router = useRouter();
  const seen = useRef(limitSignature(initial));
  const sig = limitSignature(data);
  useEffect(() => {
    if (!sig || sig === seen.current) return;
    seen.current = sig;
    if (refreshedFor === sig) return; // another component already triggered it
    refreshedFor = sig;
    router.refresh();
  }, [sig, router]);

  useEffect(() => {
    // Phones restore pages from the back/forward cache with stale numbers — always re-check.
    const refresh = () => void refreshAvailability();
    const onVisible = () => document.visibilityState === "visible" && refresh();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pageshow", refresh);
    window.addEventListener("focus", refresh);
    window.addEventListener("online", refresh);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pageshow", refresh);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("online", refresh);
    };
  }, []);
  return data;
}
