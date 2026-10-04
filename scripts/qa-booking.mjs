/**
 * End-to-end QA against a RUNNING server (demo or real DB).
 *   npm run dev            (in one terminal)
 *   npm run qa             (in another)   BASE_URL=http://localhost:3000 by default
 *
 * Uses dates 3–12 days out (untouched by demo seed data) and a fresh set of
 * mobile numbers each run, so it can be re-run. Needs ≥ 30/30 on that date to start.
 */
const BASE = process.env.BASE_URL || "http://localhost:3000";
let pass = 0, fail = 0, n = 0;
const ok = (cond, label, extra = "") => {
  cond ? pass++ : fail++;
  console.log(`${cond ? "  ✔" : "  ✘"} ${label}${cond ? "" : "  " + extra}`);
};

const runId = Math.floor(Math.random() * 9000) + 1000;
const mobile = () => `9${String(runId).padStart(4, "0")}${String(++n).padStart(5, "0")}`;
let ipN = 0;
const ip = () => `10.${runId % 250}.${Math.floor(++ipN / 250)}.${ipN % 250}`;

async function book(b, headers = {}) {
  const res = await fetch(`${BASE}/api/reservations`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Forwarded-For": ip(), ...headers },
    body: JSON.stringify({ name: "QA Tester", quantity: 1, idempotencyKey: crypto.randomUUID(), ...b }),
  });
  return { status: res.status, body: await res.json() };
}
async function avail(date) {
  const j = await (await fetch(`${BASE}/api/availability`)).json();
  return j.days.find((d) => d.date === date);
}
const dayOffset = (k) => {
  const d = new Date(Date.now() + 5.5 * 3600e3 + k * 864e5);
  return d.toISOString().slice(0, 10);
};

// Pick an untouched pair of dates (days 3–12) so the script can be re-run; restart the demo server to reset fully.
const base = 3 + (runId % 5) * 2;
const DATE = dayOffset(base);
console.log(`\nAmor Fati booking QA · ${BASE} · date ${DATE}\n`);

let a = await avail(DATE);
ok(a && a.burgers.cheese.remaining === 30 && a.burgers.nashville.remaining === 30, "DAY 1 starts at 30 / 30", JSON.stringify(a?.burgers));

console.log("\nScenario");
let r = await book({ burger: "cheese", date: DATE, mobile: mobile(), quantity: 2 });
ok(r.body.ok, "Customer A books 2 Super Cheese", JSON.stringify(r.body));
a = await avail(DATE);
ok(a.burgers.cheese.remaining === 28 && a.burgers.nashville.remaining === 30, "→ 28 Super Cheese / 30 Nashville");

r = await book({ burger: "nashville", date: DATE, mobile: mobile(), quantity: 1 });
ok(r.body.ok, "Customer B books 1 Nashville");
a = await avail(DATE);
ok(a.burgers.cheese.remaining === 28 && a.burgers.nashville.remaining === 29, "→ 28 Super Cheese / 29 Nashville");

console.log("\nSell Super Cheese out (14 × 2)");
let allOk = true;
for (let i = 0; i < 14; i++) allOk &&= (await book({ burger: "cheese", date: DATE, mobile: mobile(), quantity: 2 })).body.ok;
ok(allOk, "14 bookings of 2 all accepted");
a = await avail(DATE);
ok(a.burgers.cheese.remaining === 0 && a.burgers.cheese.status === "sold_out", "Super Cheese is SOLD OUT (0 remaining)");
r = await book({ burger: "cheese", date: DATE, mobile: mobile(), quantity: 1 });
ok(r.status === 409 && r.body.code === "SOLD_OUT", "31st burger refused with SOLD_OUT", JSON.stringify(r));
ok(r.body.message === "SORRY — THAT LAST BURGER WAS JUST CLAIMED.", "…with the 'last burger' message");
a = await avail(DATE);
ok(a.burgers.cheese.remaining === 0, "Inventory never goes negative");

console.log("\nPartial-fit: 2 requested, only 1 left");
const N = a.burgers.nashville.remaining; // 29
for (let i = 0; i < Math.floor((N - 1) / 2); i++) await book({ burger: "nashville", date: DATE, mobile: mobile(), quantity: 2 });
if ((N - 1) % 2) await book({ burger: "nashville", date: DATE, mobile: mobile(), quantity: 1 });
a = await avail(DATE);
ok(a.burgers.nashville.remaining === 1, "Nashville down to exactly 1 left", `got ${a.burgers.nashville.remaining}`);
r = await book({ burger: "nashville", date: DATE, mobile: mobile(), quantity: 2 });
ok(r.status === 409 && r.body.code === "NOT_ENOUGH" && r.body.remaining === 1, "Asking for 2 when 1 left → NOT_ENOUGH");

console.log("\nRACE: 25 customers fight for the LAST Nashville at the same instant");
const racers = await Promise.all(
  Array.from({ length: 25 }, () => book({ burger: "nashville", date: DATE, mobile: mobile(), quantity: 1 })),
);
const winners = racers.filter((x) => x.body.ok).length;
const losers = racers.filter((x) => x.body.code === "SOLD_OUT").length;
ok(winners === 1, `Exactly ONE winner (got ${winners})`);
ok(losers === 24, `24 told the last one was claimed (got ${losers})`);
a = await avail(DATE);
ok(a.burgers.nashville.remaining === 0, "Nashville inventory is 0 — never 31/30");

console.log("\nGuards");
const DATE2 = dayOffset(base + 1);
const m = mobile();
r = await book({ burger: "cheese", date: DATE2, mobile: m });
ok(r.body.ok, "Fresh booking on another date");
const k = crypto.randomUUID();
const m2 = mobile();
const r1 = await book({ burger: "nashville", date: DATE2, mobile: m2, idempotencyKey: k });
const r2 = await book({ burger: "nashville", date: DATE2, mobile: m2, idempotencyKey: k });
ok(r1.body.ok && r2.body.ok && r1.body.reservationId === r2.body.reservationId, "Same submission twice (refresh/double-tap) → same reservation, no second row");
r = await book({ burger: "cheese", date: DATE2, mobile: m });
ok(r.status === 409 && r.body.code === "DUPLICATE" && r.body.message === "You already have a reservation for this date.", "Same mobile + burger + date → DUPLICATE message");
r = await book({ burger: "cheese", date: DATE2, mobile: "12345" });
ok(r.status === 400 && r.body.message === "Enter a valid 10-digit Indian mobile number.", "Invalid mobile → friendly message");
r = await book({ burger: "cheese", date: DATE2, mobile: "5876543210" });
ok(r.status === 400, "Mobile starting with 5 rejected");
r = await book({ burger: "cheese", date: DATE2, mobile: mobile(), quantity: 3 });
ok(r.status === 400, "Quantity above the max rejected");
r = await book({ burger: "cheese", date: "2020-01-01", mobile: mobile() });
ok(r.status === 409 && r.body.message === "Reservations aren't available for this date.", "Past date → unavailable message");
r = await book({ burger: "cheese", date: dayOffset(60), mobile: mobile() });
ok(r.status === 409 && r.body.code === "DATE_UNAVAILABLE", "Date beyond booking window refused");
r = await book({ burger: "pizza", date: DATE2, mobile: mobile() });
ok(r.status === 400, "Unknown burger rejected");
r = await book({ burger: "cheese", date: DATE2, mobile: mobile(), name: "<script>alert(1)</script>" });
ok(r.status === 400, "Script-tag name rejected");
r = await book({ burger: "cheese", date: DATE2, mobile: `+91 ${mobile().slice(0, 5)} ${mobile().slice(5)}`.replace(/ /g, "") });
ok(r.status !== 500, "+91-prefixed numbers don't crash");

console.log("\nPrivacy / security");
const pub = JSON.stringify(await (await fetch(`${BASE}/api/availability`)).json());
ok(!/mobile|customer|name/i.test(pub), "Public availability API exposes no customer fields");
ok((await fetch(`${BASE}/api/admin/data`)).status === 401, "Admin data API requires login");
ok((await fetch(`${BASE}/api/admin/reservations/AF-AAAAAA`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: "{}" })).status === 401, "Admin PATCH requires login");
const resp = await fetch(`${BASE}/reserved/AF-AAAAAA`);
ok(!(await resp.text()).includes("QA Tester"), "Confirmation page without token reveals nothing");
const rl = [];
for (let i = 0; i < 10; i++) rl.push((await book({ burger: "cheese", date: DATE2, mobile: mobile() }, { "X-Forwarded-For": "203.0.113.9" })).status);
ok(rl.includes(429), "Rate limit kicks in for a single IP");

console.log(`\n${fail === 0 ? "ALL PASSED" : "FAILURES"} — ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
