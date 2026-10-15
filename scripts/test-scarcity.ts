import { breakdown, cleanMessage, computeHold, contradictsStock, publicStrip, renderMessage, PRESET_MESSAGES } from "../lib/scarcity";

let pass = 0, fail = 0;
const eq = (label: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  console.log(`  ${ok ? "✔" : "✘"} ${label}${ok ? "" : `  got ${JSON.stringify(got)} want ${JSON.stringify(want)}`}`);
};

console.log("breakdown — the four numbers");
eq("100 stock, 25 booked, 35 held → 40 available", breakdown(100, 25, 35, true), { stock: 100, booked: 25, held: 35, unallocated: 75, available: 40 });
eq("after 10 more bookings → 30 available, held unchanged", breakdown(100, 35, 35, true).available, 30);
eq("held 40, booked 20 → 40; release 15 → held 25 → 55", [breakdown(100, 20, 40, true).available, breakdown(100, 20, 25, true).available], [40, 55]);
eq("scarcity OFF ignores the hold", breakdown(100, 25, 35, false).available, 75);
eq("held can't swallow bookings (cap at unbooked)", breakdown(10, 6, 20, true), { stock: 10, booked: 6, held: 4, unallocated: 4, available: 0 });
eq("booked above stock never goes negative", breakdown(10, 12, 3, true).available, 0);
eq("negatives / fractions are clamped", breakdown(-5, -2, -1, true), { stock: 0, booked: 0, held: 0, unallocated: 0, available: 0 });

console.log("\ncomputeHold — mirrors adjust_hold() in SQL");
eq("set_available 20 of 30", computeHold("set_available", 20, 30, 0, 0), { ok: true, held: 10 });
eq("set_available 31 of 30 → refused", computeHold("set_available", 31, 30, 0, 0), { ok: false, max: 30 });
eq("set_available 31 clamped → shows everything", computeHold("set_available", 31, 30, 5, 0, true), { ok: true, held: 0 });
eq("hide 5 when 10 on sale", computeHold("hold", 5, 30, 20, 0), { ok: true, held: 5 });
eq("hide 11 when 10 on sale → refused", computeHold("hold", 11, 30, 20, 0), { ok: false, max: 10 });
eq("hide 11 clamped → hides all 10", computeHold("hold", 11, 30, 20, 0, true), { ok: true, held: 10 });
eq("release more than held → 0", computeHold("release", 99, 30, 0, 7), { ok: true, held: 0 });
eq("sold_out hides every unbooked burger", computeHold("sold_out", 0, 30, 12, 3), { ok: true, held: 18 });
eq("restore hides nothing", computeHold("restore", 0, 30, 12, 3), { ok: true, held: 0 });

console.log("\nmessages");
eq("{count} filled", renderMessage("Limited Drop — Only {count} Burgers Left.", 12), "Limited Drop — Only 12 Burgers Left.");
eq("{count} twice + case-insensitive", renderMessage("{count} / {COUNT}", 4), "4 / 4");
eq("negative count shows 0", renderMessage("Only {count}", -3), "Only 0");
eq("NaN shows 0", renderMessage("Only {count}", NaN), "Only 0");
eq("trims and collapses spaces", cleanMessage("  hi   there  "), "hi there");
eq("empty refused", cleanMessage("   "), null);
eq("161 chars refused", cleanMessage("x".repeat(161)), null);
eq("non-string refused", cleanMessage(5), null);
eq("control characters stripped", cleanMessage("a\u0000b\nc"), "a b c");
eq("the 'fully booked' preset contradicts stock", contradictsStock(PRESET_MESSAGES[4]), true);
eq("the other presets don't", PRESET_MESSAGES.slice(0, 4).some(contradictsStock), false);

console.log("\npublic strip");
const on = { on: true, message: "Limited Drop — Only {count} Burgers Left.", low: 5 };
eq("OFF → nothing", publicStrip({ ...on, on: false }, 12), null);
eq("12 left", publicStrip(on, 12), { soldOut: false, urgent: false, headline: "ONLY 12 BURGERS AVAILABLE", message: "Limited Drop — Only 12 Burgers Left." });
eq("1 left is singular", publicStrip(on, 1)?.headline, "ONLY 1 BURGER AVAILABLE");
eq("5 left is urgent (threshold is inclusive)", publicStrip(on, 5)?.urgent, true);
eq("6 left is not", publicStrip(on, 6)?.urgent, false);
eq("0 → SOLD OUT", publicStrip(on, 0), { soldOut: true, urgent: false, headline: "SOLD OUT", message: "The current drop is fully booked." });
eq("negative → SOLD OUT, never negative text", publicStrip(on, -4)?.headline, "SOLD OUT");
eq("'fully booked' message is hidden while stock remains", publicStrip({ ...on, message: PRESET_MESSAGES[4] }, 9)?.message, "");

console.log(`\n${fail === 0 ? "ALL PASSED" : "FAILURES"} — ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
