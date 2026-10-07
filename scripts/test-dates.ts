/**
 * Pins the clock to exact instants around midnight India time (Asia/Kolkata = UTC+5:30)
 * and checks the 3-day rolling window + cutoff logic.   Run: npx tsx scripts/test-dates.ts
 */
import { addMonths, bookingWindow, eachDate, isBookableDate, isClosedDate, monthEnd, monthGrid, monthLabel, monthStart, todayIST, weekdayMon0 } from "../lib/dates";
import { siteConfig } from "../config/site";

let fail = 0;
const eq = (label: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fail++;
  console.log(`${ok ? "  ✔" : "  ✘"} ${label}${ok ? "" : `\n      got  ${JSON.stringify(got)}\n      want ${JSON.stringify(want)}`}`);
};
const N = siteConfig.bookingDaysAhead;
const window = (iso: string) => { const w = bookingWindow(new Date(iso)); return eachDate(w.start, w.end).slice(0, 3); }; // first 3 dates of the window
const fullWindow = (iso: string) => { const w = bookingWindow(new Date(iso)); return eachDate(w.start, w.end); };

console.log(`\nRolling ${N}-day window (Asia/Kolkata)\n`);
// 11:59 PM IST on Oct 5  = 18:29 UTC Oct 5
eq("11:59 PM IST Oct 5  → Oct 5, 6, 7", window("2026-10-05T18:29:00Z"), ["2026-10-05", "2026-10-06", "2026-10-07"]);
// 12:00 AM IST on Oct 6  = 18:30 UTC Oct 5
eq("12:00 AM IST Oct 6  → Oct 6, 7, 8", window("2026-10-05T18:30:00Z"), ["2026-10-06", "2026-10-07", "2026-10-08"]);
eq("12:01 AM IST Oct 6  → Oct 6, 7, 8", window("2026-10-05T18:31:00Z"), ["2026-10-06", "2026-10-07", "2026-10-08"]);
// UTC midnight is 5:30 AM IST — must NOT be the rollover moment
eq("UTC midnight Oct 6 (5:30 AM IST) → Oct 6, 7, 8", window("2026-10-06T00:00:00Z"), ["2026-10-06", "2026-10-07", "2026-10-08"]);
eq("UTC midnight Oct 5 (5:30 AM IST) → still Oct 5, 6, 7", window("2026-10-05T00:00:00Z"), ["2026-10-05", "2026-10-06", "2026-10-07"]);
eq("todayIST at 18:29 UTC", todayIST(new Date("2026-10-05T18:29:00Z")), "2026-10-05");
eq("todayIST at 18:30 UTC", todayIST(new Date("2026-10-05T18:30:00Z")), "2026-10-06");
eq("month rollover: 11:59 PM IST Oct 31", window("2026-10-31T18:29:00Z"), ["2026-10-31", "2026-11-01", "2026-11-02"]);
eq("year rollover: 12:01 AM IST Jan 1", window("2026-12-31T18:31:00Z"), ["2027-01-01", "2027-01-02", "2027-01-03"]);

console.log("\nBookability\n");
const t = (iso: string, date: string) => isBookableDate(date, new Date(iso));
eq(`Oct 5 + ${N - 1} days is the last bookable date`, t("2026-10-05T06:00:00Z", "2026-11-03"), N === 30);
eq("…and the day after that is NOT bookable", t("2026-10-05T06:00:00Z", "2026-11-04"), false);
eq("Oct 28 IS bookable from Oct 8 (20 days ahead)", t("2026-10-08T06:00:00Z", "2026-10-28"), true);
eq("Oct 7 bookable on Oct 5", t("2026-10-05T06:00:00Z", "2026-10-07"), true);
eq("Oct 5 NOT bookable on Oct 6 (past)", t("2026-10-05T18:31:00Z", "2026-10-05"), false);
eq("Today bookable at 3 PM IST", t("2026-10-05T09:30:00Z", "2026-10-05"), true);
eq("Today closed after 10:00 PM IST cutoff (10:30 PM)", t("2026-10-05T17:00:00Z", "2026-10-05"), false);
eq("Tomorrow still bookable at 10:30 PM IST", t("2026-10-05T17:00:00Z", "2026-10-06"), true);

console.log("\nThe window slides forward at midnight IST — every day, forever\n");
const w1 = fullWindow("2026-10-05T18:29:00Z"); // 11:59 PM IST Oct 5
const w2 = fullWindow("2026-10-05T18:30:00Z"); // 12:00 AM IST Oct 6
eq("window length is constant", [w1.length, w2.length], [N, N]);
eq("11:59 PM → starts Oct 5", w1[0], "2026-10-05");
eq("12:00 AM → starts Oct 6 (Oct 5 drops off)", w2[0], "2026-10-06");
eq("a brand-new date enters at the far end at midnight", [w1.includes(w2[N - 1]), w2[N - 1]], [false, "2026-11-04"]);
eq("every day for 800 days: always exactly N dates, starting today",
  (() => { let bad = 0; for (let i = 0; i < 800; i++) { const at = new Date(Date.UTC(2026, 9, 5, 0, 5) + i * 864e5); const w = fullWindow(at.toISOString()); if (w.length !== N || w[0] !== todayIST(at)) bad++; } return bad; })(), 0);

console.log("\nCalendar maths\n");
eq("month start/end Oct 2026", [monthStart("2026-10-17"), monthEnd("2026-10-17")], ["2026-10-01", "2026-10-31"]);
eq("Feb 2028 (leap year) ends on the 29th", monthEnd("2028-02-10"), "2028-02-29");
eq("Feb 2027 ends on the 28th", monthEnd("2027-02-10"), "2027-02-28");
eq("addMonths across the year end", [addMonths("2026-12-15", 1), addMonths("2026-01-15", -1)], ["2027-01-01", "2025-12-01"]);
eq("month label", monthLabel("2026-10-17"), "October 2026");
eq("Oct 1 2026 is a Thursday (Mon=0 → 3)", weekdayMon0("2026-10-01"), 3);
const g = monthGrid("2026-10-08");
eq("October 2026 grid: 5 weeks of 7, first cell empty ×3", [g.length, g.every((w) => w.length === 7), g[0].slice(0, 4)], [5, true, [null, null, null, "2026-10-01"]]);
eq("grid contains each day of the month exactly once", g.flat().filter(Boolean).length, 31);

console.log("\nClosed dates\n");
eq("a normal date is not closed", isClosedDate("2026-10-28"), false);
siteConfig.closedDates.push("2026-10-28");
siteConfig.closedWeekdays.push(2); // Tuesdays
eq("a listed closed date is closed", isClosedDate("2026-10-28"), true);
eq("…and not bookable even though it is inside the window", isBookableDate("2026-10-28", new Date("2026-10-08T06:00:00Z")), false);
eq("every Tuesday is closed (Oct 13, Oct 20)", [isClosedDate("2026-10-13"), isClosedDate("2026-10-20")], [true, true]);
eq("a Wednesday is open", isBookableDate("2026-10-21", new Date("2026-10-08T06:00:00Z")), true);
siteConfig.closedDates.length = 0; siteConfig.closedWeekdays.length = 0;
console.log(fail ? `\n${fail} FAILED\n` : "\nALL PASSED\n");
process.exit(fail ? 1 : 0);
