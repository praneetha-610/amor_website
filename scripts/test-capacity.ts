/** Pure daily-limit logic. Run: npx tsx scripts/test-capacity.ts   (npm run test:capacity) */
import { hasSpecificRule, headlineFrom, ofEachPhrase, onlyPhrase, onlySentence, resolveLimit, statusFor, thresholds, type CapacityRule } from "../lib/capacity";

let fail = 0;
const eq = (label: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fail++;
  console.log(`  ${ok ? "✔" : "✘"} ${label}${ok ? "" : `\n      got  ${JSON.stringify(got)}\n      want ${JSON.stringify(want)}`}`);
};
let n = 0;
const rule = (burger: "cheese" | "nashville", start: string, end: string | null, limit: number): CapacityRule => ({
  id: `00000000-0000-0000-0000-${String(++n).padStart(12, "0")}`, burger_type: burger, start_date: start, end_date: end, daily_limit: limit,
  created_at: new Date(Date.UTC(2026, 9, 1, 0, 0, n)).toISOString(), // each later rule is newer
});

console.log("\nWhich limit applies on a date\n");
eq("no rules → the built-in default", resolveLimit([], "cheese", "2026-10-20", 30), 30);
const up = [rule("cheese", "2026-10-10", null, 40)];
eq("rule from Oct 10 onward: the day before keeps the default", resolveLimit(up, "cheese", "2026-10-09", 30), 30);
eq("…Oct 10 and any later day use it", [resolveLimit(up, "cheese", "2026-10-10", 30), resolveLimit(up, "cheese", "2030-01-01", 30)], [40, 40]);
eq("…the other burger is untouched", resolveLimit(up, "nashville", "2026-10-20", 30), 30);
const day = [...up, rule("cheese", "2026-10-24", "2026-10-24", 20)];
eq("a one-day rule beats the open-ended one on that day only", [resolveLimit(day, "cheese", "2026-10-24", 30), resolveLimit(day, "cheese", "2026-10-23", 30), resolveLimit(day, "cheese", "2026-10-25", 30)], [20, 40, 40]);
const later = [...day, rule("cheese", "2026-10-20", null, 55)];
eq("a LATER general rule does NOT overwrite an earlier special day (specific-day rules always win)", resolveLimit(later, "cheese", "2026-10-24", 30), 20);
eq("…but it applies to every other day from its start", [resolveLimit(later, "cheese", "2026-10-19", 30), resolveLimit(later, "cheese", "2026-10-20", 30), resolveLimit(later, "cheese", "2026-10-25", 30)], [40, 55, 55]);
eq("two general rules: the newest wins", resolveLimit([rule("nashville", "2026-10-01", null, 35), rule("nashville", "2026-10-01", null, 38)], "nashville", "2026-10-15", 30), 38);
eq("two overlapping special-day rules: the newest wins", resolveLimit([rule("nashville", "2026-10-10", "2026-10-12", 20), rule("nashville", "2026-10-11", "2026-10-11", 8)], "nashville", "2026-10-11", 30), 8);
eq("…and the older one still covers its other days", resolveLimit([rule("nashville", "2026-10-10", "2026-10-12", 20), rule("nashville", "2026-10-11", "2026-10-11", 8)], "nashville", "2026-10-12", 30), 20);
eq("range rule covers exactly its days", [resolveLimit([rule("nashville", "2026-10-26", "2026-10-28", 50)], "nashville", "2026-10-25", 30), resolveLimit([rule("nashville", "2026-10-26", "2026-10-28", 50)], "nashville", "2026-10-28", 30), resolveLimit([rule("nashville", "2026-10-26", "2026-10-28", 50)], "nashville", "2026-10-29", 30)], [30, 50, 30]);
eq("0 is a valid limit (burger off that day)", resolveLimit([rule("cheese", "2026-12-01", "2026-12-01", 0)], "cheese", "2026-12-01", 30), 0);
eq("rule order in the array doesn't matter", resolveLimit([...later].reverse(), "cheese", "2026-10-24", 30), 20);
eq("hasSpecificRule", [hasSpecificRule(later, "cheese", "2026-10-24"), hasSpecificRule(later, "cheese", "2026-10-25"), hasSpecificRule(later, "nashville", "2026-10-24")], [true, false, false]);

console.log("\n'Few left' wording scales with the limit\n");
eq("30/day: limited below 10, almost gone below 5 (unchanged)", [thresholds(30).limited, thresholds(30).almostGone], [10, 5]);
eq("100/day: still 10 / 5 (never gets silly-large)", [thresholds(100).limited, thresholds(100).almostGone], [10, 5]);
eq("6/day: 2 / 1", [thresholds(6).limited, thresholds(6).almostGone], [2, 1]);
eq("1/day: 1 / 1", [thresholds(1).limited, thresholds(1).almostGone], [1, 1]);
eq("status at 30/day: 9 left is limited, 10 is available, 0 sold out", [statusFor(9, 30), statusFor(10, 30), statusFor(0, 30)], ["limited", "available", "sold_out"]);
eq("status at 6/day: 3 left is available, 1 left is limited", [statusFor(3, 6), statusFor(1, 6)], ["available", "limited"]);

console.log("\nHeadline copy follows the live limits\n");
const same = headlineFrom([], "2026-10-20");
eq("defaults: 20 + 20 (40 burgers a day)", [same.cheese, same.nashville, same.total, same.each], [20, 20, 40, 20]);
eq("same limits → '20 ONLY. EVERY DAY.' / '20 of each.' / '20 only. Every day.'", [onlyPhrase(same), ofEachPhrase(same), onlySentence(same)], ["20 ONLY. EVERY DAY.", "20 of each.", "20 only. Every day."]);
const both40 = headlineFrom([rule("cheese", "2026-10-01", null, 40), rule("nashville", "2026-10-01", null, 40)], "2026-10-20");
eq("both raised to 40 → copy says 40", [both40.each, onlyPhrase(both40), both40.total], [40, "40 ONLY. EVERY DAY.", 80]);
const diff = headlineFrom([rule("cheese", "2026-10-01", null, 45)], "2026-10-20");
eq("different limits → honest wording, individual numbers kept", [diff.each, onlyPhrase(diff), ofEachPhrase(diff), diff.cheese, diff.nashville, diff.total], [null, "LIMITED. EVERY DAY.", "Limited quantities of each.", 45, 20, 65]);
eq("a rule that starts in the future doesn't change TODAY's headline", headlineFrom([rule("cheese", "2026-11-01", null, 99)], "2026-10-20").cheese, 20);
eq("20/day: limited below 7, almost gone below 4", [thresholds(20).limited, thresholds(20).almostGone], [7, 4]);
eq("status at 20/day: 6 left is limited, 7 is available, 3 is almost gone zone, 0 sold out", [statusFor(6, 20), statusFor(7, 20), statusFor(0, 20)], ["limited", "available", "sold_out"]);

console.log(fail ? `\n${fail} FAILED\n` : "\nALL PASSED\n");
process.exit(fail ? 1 : 0);
