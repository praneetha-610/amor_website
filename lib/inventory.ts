import "server-only";
import { BURGER_KEYS, type BurgerKey } from "@/config/site";
import { limitOn, statusFor, type AvailabilityStatus } from "@/lib/capacity";
import { bookingWindow, clock, eachDate, isBookableDate, todayIST } from "@/lib/dates";
import { getStore } from "@/lib/db";
import { breakdown, type PublicScarcity } from "@/lib/scarcity";

export type { AvailabilityStatus };

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
  /** Scarcity Control: only the switch, the public message and the "low" threshold — never how many are held back. */
  scarcity: PublicScarcity;
}

const NO_SCARCITY: PublicScarcity = { on: false, message: "", low: 0 };

/**
 * THE source of truth for public inventory: limit − Σ(non-cancelled reservations),
 * computed here on the server from the database. The browser only displays it.
 */
export async function getAvailability(from?: string, to?: string): Promise<AvailabilityPayload> {
  const now = clock();
  const win = bookingWindow(now);
  const start = from ?? win.start;
  const end = to ?? win.end;
  const store = getStore();
  // limits are admin-editable, so they are read fresh with the counts (same request, same moment)
  const [rows, rules, settings, holdRows] = await Promise.all([
    store.claimedCounts(start, end),
    store.listCapacityRules(),
    store.getScarcity(),
    store.listHolds(start, end),
  ]);
  const holds = new Map<string, number>();
  for (const h of holdRows) holds.set(`${h.burger}|${h.date}`, h.held);

  const claimed = new Map<string, number>();
  for (const r of rows) claimed.set(`${r.burger}|${r.date}`, r.claimed);

  const days = eachDate(start, end).map<DayAvailability>((date) => {
    const burgers = {} as Record<BurgerKey, BurgerAvailability>;
    for (const key of BURGER_KEYS) {
      const stock = limitOn(rules, key, date); // the limit in force for THIS burger on THIS date
      const c = claimed.get(`${key}|${date}`) ?? 0;
      // Scarcity Control: what customers see is the stock minus what the owner is holding back. The hold itself is never exposed.
      const b = breakdown(stock, c, holds.get(`${key}|${date}`) ?? 0, settings.enabled);
      const limit = settings.enabled ? stock - b.held : stock;
      burgers[key] = { limit, claimed: Math.min(c, limit), remaining: b.available, status: statusFor(b.available, limit) };
    }
    return { date, bookable: isBookableDate(date, now), burgers };
  });

  const scarcity: PublicScarcity = settings.enabled ? { on: true, message: settings.message, low: settings.low_threshold } : NO_SCARCITY;
  return { today: todayIST(now), days, scarcity };
}

/**
 * Public payload: every date in the rolling booking window (today + the next N-1 days, India time; N = bookingDaysAhead).
 * A date that can't be booked right now (e.g. today after the cutoff) is still listed
 * with bookable:false so customers always see the full window.
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
    return { today: todayIST(), days: [], scarcity: NO_SCARCITY };
  }
}
