/**
 * Pins the clock to exact instants around midnight India time (Asia/Kolkata = UTC+5:30)
 * and checks the 3-day rolling window + cutoff logic.   Run: npx tsx scripts/test-dates.ts
 */
import { bookingWindow, eachDate, isBookableDate, todayIST } from "../lib/dates";

let fail = 0;
const eq = (label: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fail++;
  console.log(`${ok ? "  ✔" : "  ✘"} ${label}${ok ? "" : `\n      got  ${JSON.stringify(got)}\n      want ${JSON.stringify(want)}`}`);
};
const window = (iso: string) => { const w = bookingWindow(new Date(iso)); return eachDate(w.start, w.end); };

console.log("\nRolling 3-day window (Asia/Kolkata)\n");
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
eq("Oct 8 NOT bookable on Oct 5", t("2026-10-05T06:00:00Z", "2026-10-08"), false);
eq("Oct 7 bookable on Oct 5", t("2026-10-05T06:00:00Z", "2026-10-07"), true);
eq("Oct 5 NOT bookable on Oct 6 (past)", t("2026-10-05T18:31:00Z", "2026-10-05"), false);
eq("Today bookable at 3 PM IST", t("2026-10-05T09:30:00Z", "2026-10-05"), true);
eq("Today closed after 10:00 PM IST cutoff (10:30 PM)", t("2026-10-05T17:00:00Z", "2026-10-05"), false);
eq("Tomorrow still bookable at 10:30 PM IST", t("2026-10-05T17:00:00Z", "2026-10-06"), true);

console.log(fail ? `\n${fail} FAILED\n` : "\nALL PASSED\n");
process.exit(fail ? 1 : 0);
