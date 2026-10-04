/**
 * All dates in this app are plain "YYYY-MM-DD" strings in India time (IST).
 * We never pass Date objects across the client/server boundary, so there are
 * no time-zone surprises for customers browsing from elsewhere.
 */
import { siteConfig } from "@/config/site";

const TZ = "Asia/Kolkata";
const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const MONTHS_LONG = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function parts(now: Date) {
  const f = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  });
  const o: Record<string, string> = {};
  for (const p of f.formatToParts(now)) o[p.type] = p.value;
  return o;
}

export function todayIST(now: Date = new Date()): string {
  const p = parts(now);
  return `${p.year}-${p.month}-${p.day}`;
}

export function minutesNowIST(now: Date = new Date()): number {
  const p = parts(now);
  return Number(p.hour) * 60 + Number(p.minute);
}

export function isValidISODate(s: string): boolean {
  if (!ISO_DATE.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

export function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}

function utc(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/** "OCT 04" */
export function shortDate(iso: string): string {
  const [, m, d] = iso.split("-").map(Number);
  return `${MONTHS[m - 1]} ${String(d).padStart(2, "0")}`;
}

/** "October 4" */
export function monthDay(iso: string): string {
  const [, m, d] = iso.split("-").map(Number);
  return `${MONTHS_LONG[m - 1]} ${d}`;
}

/** "Sunday, 4 October 2026" */
export function longDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${WEEKDAYS[utc(iso).getUTCDay()]}, ${d} ${MONTHS_LONG[m - 1]} ${y}`;
}

export function weekdayShort(iso: string): string {
  return WEEKDAYS[utc(iso).getUTCDay()].slice(0, 3).toUpperCase();
}

/** TODAY / TOMORROW / SUN … relative to `today`. */
export function relativeLabel(iso: string, today: string): string {
  if (iso === today) return "TODAY";
  if (iso === addDays(today, 1)) return "TOMORROW";
  return weekdayShort(iso);
}

/** First and last bookable dates (inclusive), derived from config. */
export function bookingWindow(now: Date = new Date()): { start: string; end: string } {
  const today = todayIST(now);
  const cfgStart = siteConfig.bookingStartDate;
  const start = cfgStart && isValidISODate(cfgStart) && cfgStart > today ? cfgStart : today;
  const cfgEnd = siteConfig.bookingEndDate;
  const end =
    cfgEnd && isValidISODate(cfgEnd) ? cfgEnd : addDays(start, siteConfig.bookingDaysAhead - 1);
  return { start, end };
}

/**
 * Is this date reservable right now?
 * (inside the window, not in the past, and — for today — before the cutoff)
 */
export function isBookableDate(iso: string, now: Date = new Date()): boolean {
  if (!isValidISODate(iso)) return false;
  const { start, end } = bookingWindow(now);
  const today = todayIST(now);
  if (iso < start || iso > end || iso < today) return false;
  if (iso === today && siteConfig.todayBookingCutoff) {
    const [h, m] = siteConfig.todayBookingCutoff.split(":").map(Number);
    if (minutesNowIST(now) >= h * 60 + m) return false;
  }
  return true;
}

export function eachDate(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to && out.length < 400; d = addDays(d, 1)) out.push(d);
  return out;
}
