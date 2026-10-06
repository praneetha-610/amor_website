import "server-only";
import { BURGER_KEYS, getBurger, type BurgerKey } from "@/config/site";
import { eachDate, isValidISODate, todayIST } from "@/lib/dates";
import { getStore } from "@/lib/db";
import { HOLDS_INVENTORY, STATUSES, type Reservation, type ReservationStatus } from "@/lib/db/types";

export interface BurgerDay {
  limit: number;
  sold: number; // non-cancelled quantity
  completed: number; // collected quantity
  remaining: number;
}

export interface AdminData {
  today: string;
  from: string;
  to: string;
  todaySummary: Record<BurgerKey, BurgerDay>;
  /** One row per date in range with sold/remaining for each burger. */
  daily: { date: string; burgers: Record<BurgerKey, BurgerDay> }[];
  totals: { bookings: number; burgers: number; confirmed: number; completed: number; cancelled: number; no_show: number };
  reservations: Reservation[];
  /** True when the list is a search across all dates rather than the selected date range. */
  searchedAllDates: boolean;
}

function emptyDay(): Record<BurgerKey, BurgerDay> {
  const o = {} as Record<BurgerKey, BurgerDay>;
  for (const k of BURGER_KEYS) {
    const limit = getBurger(k).dailyLimit;
    o[k] = { limit, sold: 0, completed: 0, remaining: limit };
  }
  return o;
}

function tally(rows: Reservation[], date: string): Record<BurgerKey, BurgerDay> {
  const d = emptyDay();
  for (const r of rows) {
    if (r.reservation_date !== date || !HOLDS_INVENTORY(r.status)) continue;
    const b = d[r.burger_type];
    b.sold += r.quantity;
    if (r.status === "completed") b.completed += r.quantity;
  }
  for (const k of BURGER_KEYS) d[k].remaining = Math.max(0, d[k].limit - d[k].sold);
  return d;
}

export async function loadAdminData(opts: {
  from: string;
  to: string;
  q?: string;
  status?: string;
}): Promise<AdminData> {
  const today = todayIST();
  const from = isValidISODate(opts.from) ? opts.from : today;
  let to = isValidISODate(opts.to) ? opts.to : from;
  if (to < from) to = from;

  const store = getStore();
  const status = STATUSES.includes(opts.status as ReservationStatus) ? (opts.status as ReservationStatus) : undefined;

  // Unfiltered rows for the numbers; filtered rows for the table.
  // When staff type a search (ID / name / mobile) we look across EVERY date — a customer may show
  // up with a booking for another day, and staff need to see that, not "no results".
  const searching = Boolean(opts.q && opts.q.trim());
  const [all, todayRows, filtered] = await Promise.all([
    store.listReservations({ from, to }),
    store.listReservations({ from: today, to: today }),
    searching
      ? store.listReservations({ from: "2000-01-01", to: "2100-01-01", q: opts.q, status }).then((r) => r.slice(0, 60))
      : store.listReservations({ from, to, status }),
  ]);

  const totals = { bookings: 0, burgers: 0, confirmed: 0, completed: 0, cancelled: 0, no_show: 0 };
  for (const r of all) {
    totals.bookings++;
    totals[r.status]++;
    if (HOLDS_INVENTORY(r.status)) totals.burgers += r.quantity;
  }

  return {
    today,
    from,
    to,
    todaySummary: tally(todayRows, today),
    daily: eachDate(from, to).map((date) => ({ date, burgers: tally(all, date) })),
    totals,
    reservations: filtered,
    searchedAllDates: searching,
  };
}
