/**
 * End-to-end QA against a RUNNING server (demo or real DB).
 *   npm run dev            (in one terminal)
 *   npm run qa             (in another)   BASE_URL=http://localhost:3000 by default
 *
 * The booking window is now TODAY + 2 days, so this uses tomorrow and the day after.
 * Start the server with an empty demo store so both dates are 30/30:
 *     DEMO_SEED=false npm run dev
 * Each server start allows ONE run (the script sells those dates out on purpose).
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
    body: JSON.stringify({ name: "QA Tester", quantity: 1, consent: true, idempotencyKey: crypto.randomUUID(), ...b }),
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

const DATE = dayOffset(1);
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
const DATE2 = dayOffset(2);
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
r = await book({ burger: "cheese", date: dayOffset(3), mobile: mobile() });
ok(r.status === 409 && r.body.code === "DATE_UNAVAILABLE", "3 days out (outside today + next 2) refused");
r = await book({ burger: "cheese", date: dayOffset(60), mobile: mobile() });
ok(r.status === 409 && r.body.code === "DATE_UNAVAILABLE", "Date far beyond the window refused");
{
  const j = await (await fetch(`${BASE}/api/availability`)).json();
  ok(j.days.length === 3, "Availability lists exactly 3 dates", `got ${j.days.length}`);
  ok(j.days[0].date === j.today && j.days[2].date === dayOffset(2), "…today, tomorrow, day after");
}

console.log("\nConsent (mandatory, enforced server-side)");
r = await book({ burger: "cheese", date: DATE2, mobile: mobile(), consent: undefined });
ok(r.status === 400 && r.body.fieldErrors?.consent, "Missing consent → rejected", JSON.stringify(r));
r = await book({ burger: "cheese", date: DATE2, mobile: mobile(), consent: false });
ok(r.status === 400 && r.body.fieldErrors?.consent, "consent:false → rejected");
r = await book({ burger: "cheese", date: DATE2, mobile: mobile(), consent: "true" });
ok(r.status === 400, 'consent:"true" (string) → rejected');
r = await book({ burger: "cheese", date: DATE2, mobile: mobile(), consent: 1 });
ok(r.status === 400, "consent:1 → rejected");
a = await avail(DATE2);
ok(a.burgers.cheese.remaining === a.burgers.cheese.limit - 1, "Rejected bookings consumed no inventory", JSON.stringify(a.burgers.cheese));
r = await book({ burger: "pizza", date: DATE2, mobile: mobile() });
ok(r.status === 400, "Unknown burger rejected");
r = await book({ burger: "cheese", date: DATE2, mobile: mobile(), name: "<script>alert(1)</script>" });
ok(r.status === 400, "Script-tag name rejected");
r = await book({ burger: "cheese", date: DATE2, mobile: `+91 ${mobile().slice(0, 5)} ${mobile().slice(5)}`.replace(/ /g, "") });
ok(r.status !== 500, "+91-prefixed numbers don't crash");

console.log("\nTicket pop-up data + My reservation (name + mobile, no ID)");
{
  const mT = mobile();
  const bk = await book({ burger: "nashville", date: DATE2, mobile: mT, name: "Meera Iyer", quantity: 2 });
  const t = bk.body.reservation;
  ok(bk.body.ok && /^AF-[A-Z0-9]{6}$/.test(t?.reservationId) && t.name === "Meera Iyer" && t.quantity === 2 && t.total === 2 * t.unitPrice, "Booking response carries the ticket (ID, name, qty, total)", JSON.stringify(bk.body));
  ok(!("mobile" in t) && !("mobile_number" in t), "…and does not echo the mobile number back");
  const L = (b, h = {}) => fetch(`${BASE}/api/reservations/lookup`, { method: "POST", headers: { "Content-Type": "application/json", "X-Forwarded-For": ip(), ...h }, body: JSON.stringify(b) }).then(async (r) => ({ status: r.status, body: await r.json() }));
  let l = await L({ name: "Meera Iyer", mobile: mT });
  ok(l.status === 200 && l.body.reservations?.[0]?.reservationId === t.reservationId, "Lookup by name + mobile finds the booking (no ID needed)", JSON.stringify(l));
  ok(l.body.reservations[0].url.startsWith(`/reserved/${t.reservationId}?k=`), "…and returns a signed link to the ticket");
  l = await L({ name: "meera", mobile: `+91 ${mT.slice(0, 5)} ${mT.slice(5)}` });
  ok(l.status === 200, "First name only, lowercase, +91 with spaces → still found");
  l = await L({ name: "Someone Else", mobile: mT });
  ok(l.status === 404 && l.body.message.includes("couldn't find"), "Right mobile, wrong name → generic not-found");
  l = await L({ name: "Meera Iyer", mobile: "9000099999" });
  ok(l.status === 404, "Unknown mobile → the SAME not-found (can't probe which numbers booked)");
  l = await L({ name: "M", mobile: mT });
  ok(l.status === 400, "One-letter name rejected");
  const flood = [];
  for (let i = 0; i < 8; i++) flood.push((await L({ name: `Guess ${i}`, mobile: mT })).status);
  ok(flood.includes(429), "Guessing names for one number gets rate-limited");
  const page = await (await fetch(`${BASE}${bk.body.url}`)).text();
  ok(page.includes(t.reservationId) && page.includes("Meera Iyer"), "Permanent ticket page shows the same ID + name");
  ok(!JSON.stringify(await (await fetch(`${BASE}/api/availability`)).json()).includes(t.reservationId), "IDs never appear in the public availability data");
}

console.log("\nStaff check-in: search all dates, collected timestamps");
{
  const pw = process.env.ADMIN_PASSWORD || "demo";
  const good = await fetch(`${BASE}/api/admin/login`, { method: "POST", headers: { "Content-Type": "application/json", "X-Forwarded-For": ip() }, body: JSON.stringify({ password: pw }) });
  const H = { "Content-Type": "application/json", Cookie: (good.headers.get("set-cookie") || "").split(";")[0] };
  const m4 = mobile();
  const bk = await book({ burger: "cheese", date: DATE2, mobile: m4, name: "Checkin Person", quantity: 1 });
  const id = bk.body.reservationId;
  // today's view does NOT include a booking for day+2 …
  const todayView = await (await fetch(`${BASE}/api/admin/data?from=${dayOffset(0)}&to=${dayOffset(0)}`, { headers: H })).json();
  ok(!todayView.reservations.some((r) => r.reservation_id === id), "Today's list doesn't include a booking for another day");
  // … but typing the ID finds it anyway
  const s1 = await (await fetch(`${BASE}/api/admin/data?from=${dayOffset(0)}&to=${dayOffset(0)}&q=${id.slice(3)}`, { headers: H })).json();
  ok(s1.searchedAllDates && s1.reservations.some((r) => r.reservation_id === id), "Searching the ID (even just the 6 characters) finds it across all dates");
  const s2 = await (await fetch(`${BASE}/api/admin/data?from=${dayOffset(0)}&to=${dayOffset(0)}&q=${m4.slice(-5)}`, { headers: H })).json();
  ok(s2.reservations.some((r) => r.reservation_id === id), "Searching the last 5 digits of the mobile finds it");
  const s3 = await (await fetch(`${BASE}/api/admin/data?from=${dayOffset(0)}&to=${dayOffset(0)}&q=checkin`, { headers: H })).json();
  ok(s3.reservations.some((r) => r.reservation_id === id), "Searching by name finds it");
  let row = s1.reservations.find((r) => r.reservation_id === id);
  ok(row.collected_at === null, "Not collected yet (collected_at empty)");
  // A booking for ANOTHER date can't be collected today (each date has its own 30 burgers).
  const future = await fetch(`${BASE}/api/admin/reservations/${id}`, { method: "PATCH", headers: H, body: JSON.stringify({ status: "completed" }) });
  ok(future.status === 409, "Collecting a booking made for another day is refused (409)");
  const stillConfirmed = (await (await fetch(`${BASE}/api/admin/data?from=${DATE2}&to=${DATE2}&q=${id}`, { headers: H })).json()).reservations[0];
  ok(stillConfirmed.status === "confirmed" && stillConfirmed.collected_at === null, "…and it stays confirmed, untouched");

  // Collect flow: needs a booking for TODAY, which is only possible before the 10 PM cutoff.
  const todayDay = (await (await fetch(`${BASE}/api/availability`)).json()).days[0];
  if (todayDay.bookable) {
    const mt = mobile();
    const tb = await book({ burger: "cheese", date: dayOffset(0), mobile: mt, name: "Today Collector", quantity: 1 });
    const tid = tb.body.reservationId;
    const beforeT = (await avail(dayOffset(0))).burgers.cheese.remaining;
    const done = await (await fetch(`${BASE}/api/admin/reservations/${tid}`, { method: "PATCH", headers: H, body: JSON.stringify({ status: "completed" }) })).json();
    ok(done.reservation?.status === "completed" && !!done.reservation.collected_at, "Marking TODAY's booking collected stamps collected_at");
    ok((await avail(dayOffset(0))).burgers.cheese.remaining === beforeT, "Collecting does NOT free the burger (it was handed over)");
    const undo = await (await fetch(`${BASE}/api/admin/reservations/${tid}`, { method: "PATCH", headers: H, body: JSON.stringify({ status: "confirmed" }) })).json();
    ok(undo.reservation.collected_at === null, "UNDO clears collected_at");
    await fetch(`${BASE}/api/admin/reservations/${tid}`, { method: "PATCH", headers: H, body: JSON.stringify({ status: "completed" }) });
    const lk = await fetch(`${BASE}/api/reservations/lookup`, { method: "POST", headers: { "Content-Type": "application/json", "X-Forwarded-For": ip() }, body: JSON.stringify({ name: "Today Collector", mobile: mt }) }).then((r) => r.json());
    ok(lk.reservations[0].status === "completed", "The customer's own lookup now shows COLLECTED");
  } else {
    console.log("  ·  (today is past the booking cutoff — collect-today checks skipped)");
  }
  const cx = await (await fetch(`${BASE}/api/admin/reservations/${id}`, { method: "PATCH", headers: H, body: JSON.stringify({ status: "cancelled" }) })).json();
  ok(cx.reservation.status === "cancelled" && !!cx.reservation.cancelled_at && cx.reservation.collected_at === null, "Cancelling stamps cancelled_at");
}

console.log("\nAdmin (password: ADMIN_PASSWORD, or \"demo\" in demo mode)");
{
  const pw = process.env.ADMIN_PASSWORD || "demo";
  const bad = await fetch(`${BASE}/api/admin/login`, { method: "POST", headers: { "Content-Type": "application/json", "X-Forwarded-For": ip() }, body: JSON.stringify({ password: "definitely-wrong" }) });
  ok(bad.status === 401, "Wrong admin password → 401");
  const good = await fetch(`${BASE}/api/admin/login`, { method: "POST", headers: { "Content-Type": "application/json", "X-Forwarded-For": ip() }, body: JSON.stringify({ password: pw }) });
  const cookie = (good.headers.get("set-cookie") || "").split(";")[0];
  ok(good.status === 200 && cookie.startsWith("af_admin="), "Correct password → session cookie");
  ok(/httponly/i.test(good.headers.get("set-cookie") || ""), "Session cookie is HttpOnly (JavaScript can't read it)");
  const H = { "Content-Type": "application/json", Cookie: cookie };
  // a fresh booking, then admin sees it with name + ID
  const m3 = mobile();
  const bk = await book({ burger: "cheese", date: DATE2, mobile: m3, name: "Admin Visible", quantity: 1 });
  const data = await (await fetch(`${BASE}/api/admin/data?from=${DATE2}&to=${DATE2}`, { headers: H })).json();
  const row = data.reservations?.find((r) => r.reservation_id === bk.body.reservationId);
  ok(row && row.customer_name === "Admin Visible" && row.mobile_number === m3, "Admin sees the booking: ID + name + mobile", JSON.stringify(row));
  const search = await (await fetch(`${BASE}/api/admin/data?from=${DATE2}&to=${DATE2}&q=${bk.body.reservationId}`, { headers: H })).json();
  ok(search.reservations.length === 1, "Admin search by reservation ID finds exactly it");
  const before = (await avail(DATE2)).burgers.cheese.remaining;
  const noAuth = await fetch(`${BASE}/api/admin/reservations/${bk.body.reservationId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "cancelled" }) });
  ok(noAuth.status === 401, "Cancel WITHOUT admin login → 401 (customers can't cancel)");
  ok((await avail(DATE2)).burgers.cheese.remaining === before, "…and nothing was released");
  for (const method of ["DELETE", "PUT"]) {
    const r2 = await fetch(`${BASE}/api/reservations/${bk.body.reservationId}`, { method, headers: { "Content-Type": "application/json" } });
    ok(r2.status === 404 || r2.status === 405, `No public ${method} endpoint exists for reservations`);
  }
  const bogus = await fetch(`${BASE}/api/admin/reservations/${bk.body.reservationId}`, { method: "PATCH", headers: { ...H, Origin: "https://evil.example" }, body: JSON.stringify({ status: "cancelled" }) });
  ok(bogus.status === 403, "Cancel from another website's origin → 403 (CSRF guard)");
  const done = await fetch(`${BASE}/api/admin/reservations/${bk.body.reservationId}`, { method: "PATCH", headers: H, body: JSON.stringify({ status: "cancelled" }) });
  ok(done.status === 200, "Admin cancel succeeds");
  ok((await avail(DATE2)).burgers.cheese.remaining === before + 1, "Cancelling puts the burger back in stock (+1)", String((await avail(DATE2)).burgers.cheese.remaining));
  const again = await book({ burger: "cheese", date: DATE2, mobile: m3, name: "Admin Visible", quantity: 1 });
  ok(again.body.ok, "Same customer can book again after an admin cancel");
  const inv = await fetch(`${BASE}/api/admin/reservations/${bk.body.reservationId}`, { method: "PATCH", headers: H, body: JSON.stringify({ status: "hacked" }) });
  ok(inv.status === 400, "Invalid status value rejected");
}

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
