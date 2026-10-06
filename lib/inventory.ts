import "server-only";
import { BURGER_KEYS, getBurger, siteConfig, type BurgerKey } from "@/config/site";
import { bookingWindow, eachDate, isBookableDate, todayIST } from "@/lib/dates";
import { getStore } from "@/lib/db";

export type AvailabilityStatus = "available" | "limited" | "sold_out";

export interface BurgerAvailability {
  limit: number;
  claimed: number;
  remaining: number;
  status: AvailabilityStatus;
}

export interface DayAvailability {
  date: string;
  bookable: boolean;
  burgers: Record<BurgerKey, BurgerAvailability>;
}

export interface AvailabilityPayload {
  today: string;
  days: DayAvailability[];
}

export function statusFor(remaining: number): AvailabilityStatus {
  if (remaining <= 0) return "sold_out";
  if (remaining < siteConfig.limitedThreshold) return "limited";
  return "available";
}

/**
 * THE source of truth for public inventory: limit − Σ(non-cancelled reservations),
 * computed here on the server from the database. The browser only displays it.
 */
export async function getAvailability(from?: string, to?: string): Promise<AvailabilityPayload> {
  const now = new Date();
  const win = bookingWindow(now);
  const start = from ?? win.start;
  const end = to ?? win.end;
  const rows = await getStore().claimedCounts(start, end);

  const claimed = new Map<string, number>();
  for (const r of rows) claimed.set(`${r.burger}|${r.date}`, r.claimed);

  const days = eachDate(start, end).map<DayAvailability>((date) => {
    const burgers = {} as Record<BurgerKey, BurgerAvailability>;
    for (const key of BURGER_KEYS) {
      const limit = getBurger(key).dailyLimit;
      const c = claimed.get(`${key}|${date}`) ?? 0;
      const remaining = Math.max(0, limit - c);
      burgers[key] = { limit, claimed: Math.min(c, limit), remaining, status: statusFor(remaining) };
    }
    return { date, bookable: isBookableDate(date, now), burgers };
  });

  return { today: todayIST(now), days };
}

/**
 * Public payload: every date in the rolling window (today + the next 2, in India time).
 * A date that can't be booked right now (e.g. today after the cutoff) is still listed
 * with bookable:false so customers always see the full 3-day window.
 */
export async function getPublicAvailability(): Promise<AvailabilityPayload> {
  return getAvailability();
}


/** Never throws: pages stay up (with "—" numbers) if the database hiccups; the client re-polls. */
export async function getPublicAvailabilitySafe(): Promise<AvailabilityPayload> {
  try {
    return await getPublicAvailability();
  } catch (e) {
    console.error("[amor-fati] availability failed:", e instanceof Error ? e.message : e);
    return { today: todayIST(), days: [] };
  }
}
