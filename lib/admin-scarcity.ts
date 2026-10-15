import "server-only";
import { BURGER_KEYS, getBurger, siteConfig, type BurgerKey } from "@/config/site";
import { limitOn } from "@/lib/capacity";
import { bookingWindow, clock, eachDate, isBookableDate, todayIST } from "@/lib/dates";
import { getStore } from "@/lib/db";
import type { AuditEntry } from "@/lib/db/types";
import { breakdown, type ScarcitySettings } from "@/lib/scarcity";

export interface ScarcityBurger {
  /** the day's limit — what is physically made */
  stock: number;
  /** allocated to customers (non-cancelled bookings) */
  booked: number;
  /** withheld by the owner (not sold) */
  held: number;
  /** stock nobody has booked */
  unallocated: number;
  /** what customers can book RIGHT NOW (= unallocated when scarcity is OFF) */
  available: number;
  /** what customers could book with scarcity ON */
  availableIfOn: number;
  /** how many more bookings this could be, given 1…max burgers each */
  bookingsLeft: { min: number; max: number };
}

export interface ScarcityOverview {
  today: string;
  windowStart: string;
  windowEnd: string;
  /** the date the numbers are for */
  date: string;
  firstBookable: string | null;
  maxPerCustomer: number;
  settings: ScarcitySettings;
  burgers: Record<BurgerKey, ScarcityBurger>;
  /** every date in the booking window that currently has stock held back */
  heldDays: { date: string; burger: BurgerKey; held: number }[];
  audit: AuditEntry[];
}

/** The dates a customer can currently book (today after the cutoff is not one of them). */
export function bookableDates(now = clock()): string[] {
  const w = bookingWindow(now);
  return eachDate(w.start, w.end).filter((d) => isBookableDate(d, now));
}

export async function loadScarcityOverview(date?: string): Promise<ScarcityOverview> {
  const store = getStore();
  const now = clock();
  const today = todayIST(now);
  const win = bookingWindow(now);
  const open = bookableDates(now);
  const day = date && open.includes(date) ? date : open[0] ?? today;

  const [rules, claimed, holds, settings, audit] = await Promise.all([
    store.listCapacityRules(),
    store.claimedCounts(win.start, win.end),
    store.listHolds(win.start, win.end),
    store.getScarcity(),
    store.listAudit(25),
  ]);
  const max = siteConfig.maximumQuantityPerCustomer;

  const burgers = {} as ScarcityBurger_Map;
  for (const k of BURGER_KEYS) {
    const stock = limitOn(rules, k, day);
    const booked = claimed.find((c) => c.burger === k && c.date === day)?.claimed ?? 0;
    const held = holds.find((h) => h.burger === k && h.date === day)?.held ?? 0;
    const b = breakdown(stock, booked, held, settings.enabled);
    const on = breakdown(stock, booked, held, true);
    burgers[k] = {
      stock: b.stock,
      booked: b.booked,
      held: b.held,
      unallocated: b.unallocated,
      available: b.available,
      availableIfOn: on.available,
      bookingsLeft: { min: Math.ceil(b.available / max), max: b.available },
    };
  }

  return {
    today,
    windowStart: win.start,
    windowEnd: win.end,
    date: day,
    firstBookable: open[0] ?? null,
    maxPerCustomer: max,
    settings,
    burgers,
    heldDays: holds
      .filter((h) => h.held > 0 && open.includes(h.date))
      .map((h) => ({ date: h.date, burger: h.burger, held: h.held }))
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.burger < b.burger ? -1 : 1)),
    audit,
  };
}
type ScarcityBurger_Map = Record<BurgerKey, ScarcityBurger>;

export const burgerName = (k: BurgerKey) => getBurger(k).shortName;

export const DB_UPDATE_MSG =
  "Scarcity Control needs a one-time database update. Run supabase/migrations/006_scarcity_control.sql in the Supabase SQL Editor, then try again.";

/** The database hasn't been given the scarcity tables / functions yet. */
export function needsDbUpdate(e: unknown): boolean {
  const code = (e as { code?: string } | null)?.code;
  return code === "PGRST202" || code === "42883" || code === "42P01" || code === "PGRST205";
}

/** The dashboard has one shared admin login, so every logged action is recorded as this actor. */
export const ADMIN_ACTOR = "admin";
