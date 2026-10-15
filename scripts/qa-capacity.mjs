/**
 * End-to-end test of the admin-editable daily limits against a RUNNING server.
 *     DEMO_SEED=false npm run dev      (fresh store)
 *     npm run qa:capacity
 * One run per server start (it books and changes limits on purpose).
 */
const BASE = process.env.BASE_URL || "http://localhost:3000";
const PW = process.env.ADMIN_PASSWORD || "demo";
let pass = 0, fail = 0, seq = 0;
const ok = (c, label, extra = "") => { c ? pass++ : fail++; console.log(`  ${c ? "✔" : "✘"} ${label}${c ? "" : "  " + extra}`); };
const run = Math.floor(Math.random() * 9000) + 1000;
const mobile = () => `9${String(run).padStart(4, "0")}${String(++seq).padStart(5, "0")}`;
let ipN = 0;
const ip = () => `10.${run % 250}.${Math.floor(++ipN / 250)}.${ipN % 250}`;
const dayOffset = (k) => new Date(Date.now() + 5.5 * 3600e3 + k * 864e5).toISOString().slice(0, 10);

const J = (r) => r.json();
async function book(b) {
  const res = await fetch(`${BASE}/api/reservations`, { method: "POST", headers: { "Content-Type": "application/json", "X-Forwarded-For": ip() }, body: JSON.stringify({ name: "Cap Tester", quantity: 1, consent: true, idempotencyKey: crypto.randomUUID(), mobile: mobile(), ...b }) });
  return { status: res.status, body: await res.json() };
}
const availability = async () => (await J(await fetch(`${BASE}/api/availability`, { headers: { "X-Forwarded-For": ip() } })));
const day = async (d) => (await availability()).days.find((x) => x.date === d);

// ── admin session
const login = await fetch(`${BASE}/api/admin/login`, { method: "POST", headers: { "Content-Type": "application/json", "X-Forwarded-For": ip() }, body: JSON.stringify({ password: PW }) });
const cookie = (login.headers.get("set-cookie") || "").split(";")[0];
const H = { "Content-Type": "application/json", Cookie: cookie };
const cap = () => fetch(`${BASE}/api/admin/capacity`, { headers: H }).then(J);
const setCap = (b, headers = H) => fetch(`${BASE}/api/admin/capacity`, { method: "POST", headers, body: JSON.stringify(b) }).then(async (r) => ({ status: r.status, body: await r.json() }));
const delRule = (id, headers = H) => fetch(`${BASE}/api/admin/capacity/${id}`, { method: "DELETE", headers }).then(async (r) => ({ status: r.status, body: await r.json() }));
const cancel = (id) => fetch(`${BASE}/api/admin/reservations/${id}`, { method: "PATCH", headers: H, body: JSON.stringify({ status: "cancelled" }) });
async function fill(burger, date, total, step = 2) { let left = total, ids = []; while (left > 0) { const q = Math.min(step, left); const r = await book({ burger, date, quantity: q }); if (!r.body.ok) return { ok: false, last: r, ids }; ids.push([r.body.reservationId, q]); left -= q; } return { ok: true, ids }; }

console.log(`\nDaily limits · ${BASE}\n`);

console.log("Baseline");
{
  const o = await cap();
  ok(o.ok && o.burgers.cheese.current === 30 && o.burgers.nashville.current === 30 && o.rules.length === 0, "starts at 30 / 30 with no changes", JSON.stringify(o).slice(0, 200));
  const a = await availability();
  ok(a.days.every((d) => d.burgers.cheese.limit === 30 && d.burgers.nashville.limit === 30), "every date shows limit 30 for both burgers");
}

console.log("\nOnly the admin can change limits");
{
  ok((await fetch(`${BASE}/api/admin/capacity`)).status === 401, "reading limits without login → 401");
  ok((await setCap({ burger: "cheese", limit: 99 }, { "Content-Type": "application/json" })).status === 401, "changing limits without login → 401");
  ok((await delRule("00000000-0000-0000-0000-000000000000", { "Content-Type": "application/json" })).status === 401, "removing a change without login → 401");
  ok((await setCap({ burger: "cheese", limit: 99 }, { ...H, Origin: "https://evil.example" })).status === 403, "change from another website's origin → 403 (CSRF guard)");
  ok((await fetch(`${BASE}/api/reservations/capacity`, { method: "POST" })).status === 404, "there is no public endpoint to change limits");
  ok((await availability()).days[2].burgers.cheese.limit === 30, "…and nothing changed");
}

console.log("\nValidation (friendly messages, nothing saved)");
{
  const bad = [
    [{ burger: "cheese", limit: "lots" }, "text instead of a number"],
    [{ burger: "cheese", limit: -1 }, "negative number"],
    [{ burger: "cheese", limit: 501 }, "above the maximum (500)"],
    [{ burger: "cheese", limit: 12.5 }, "decimal"],
    [{ limit: 20 }, "no burger"],
    [{ burger: "pizza", limit: 20 }, "unknown burger"],
    [{ burger: "cheese", limit: 20, start: "2020-01-01" }, "start date in the past"],
    [{ burger: "cheese", limit: 20, start: "not-a-date" }, "garbage start date"],
    [{ burger: "cheese", limit: 20, start: dayOffset(5), end: dayOffset(3) }, "end before start"],
  ];
  for (const [b, label] of bad) { const r = await setCap(b); ok(r.status === 400 && typeof r.body.message === "string" && r.body.message.length > 5, `${label} → 400 with a readable message`, JSON.stringify(r)); }
  ok((await cap()).rules.length === 0, "none of the rejected changes were stored");
}

console.log("\nScale UP");
const D1 = dayOffset(5);
{
  const r = await setCap({ burger: "cheese", limit: 40 });
  ok(r.status === 200 && r.body.ok && r.body.rule.daily_limit === 40 && r.body.burgers.cheese.current === 40, "Super Cheese → 40 a day, from today", JSON.stringify(r.body).slice(0, 160));
  const d = await day(D1);
  ok(d.burgers.cheese.limit === 40 && d.burgers.cheese.remaining === 40, "customers now see 40 left on a fresh date");
  ok(d.burgers.nashville.limit === 30 && d.burgers.nashville.remaining === 30, "…Nashville is untouched (30)");
  ok((await availability()).days.every((x) => x.burgers.cheese.limit === 40), "…and every date in the window shows 40");
  const f = await fill("cheese", D1, 40);
  ok(f.ok && (await day(D1)).burgers.cheese.remaining === 0, "40 Super Cheese can be booked on that date");
  const over = await book({ burger: "cheese", date: D1 });
  ok(over.status === 409 && over.body.code === "SOLD_OUT", "the 41st is refused → never above the NEW limit");
  var D1ids = f.ids;
}

console.log("\nScale DOWN is protected");
{
  const before = (await cap()).rules.length;
  const r = await setCap({ burger: "cheese", limit: 35 });
  ok(r.status === 409 && r.body.code === "BELOW_BOOKED" && r.body.claimed === 40 && r.body.date === D1, "35 refused — that date already has 40 booked", JSON.stringify(r.body));
  ok(/already has 40 booked/.test(r.body.message) && /cancel/i.test(r.body.message), "…the message says which day and what to do", r.body.message);
  ok((await cap()).rules.length === before && (await day(D1)).burgers.cheese.limit === 40, "…nothing was changed");
  ok((await setCap({ burger: "cheese", limit: 40 })).status === 200, "setting it to exactly what's booked (40) is allowed");
  // cancel 3 reservations of 2 → 34 booked, then 34 is allowed
  for (const [id] of D1ids.slice(0, 3)) await cancel(id);
  ok((await day(D1)).burgers.cheese.remaining === 6, "cancelling 3 bookings frees 6 burgers (34 booked)");
  const ok34 = await setCap({ burger: "cheese", limit: 34 });
  ok(ok34.status === 200, "now 34 is allowed");
  const dd = await day(D1);
  ok(dd.burgers.cheese.limit === 34 && dd.burgers.cheese.remaining === 0 && dd.burgers.cheese.status === "sold_out", "that date shows sold out at 34 / 34");
  const general = (await cap()).rules.filter((r) => r.burger_type === "cheese" && r.end_date === null && r.start_date <= dayOffset(0));
  ok(general.length === 1 && general[0].daily_limit === 34 && general[0].effective, "the list shows only the setting that applies (34) — older, replaced ones that already started are hidden", JSON.stringify(general));
  const fresh = await day(dayOffset(9));
  ok(fresh.burgers.cheese.limit === 34 && fresh.burgers.cheese.remaining === 34, "other dates now show 34 left");
  ok((await book({ burger: "cheese", date: D1 })).body.code === "SOLD_OUT", "nobody can book that date any more");
}

console.log("\nSpecific days (one day and a range)");
const D2 = dayOffset(7), R1 = dayOffset(10), R2 = dayOffset(12);
{
  let r = await setCap({ burger: "nashville", limit: 12, start: D2, end: D2 });
  ok(r.status === 200, "Nashville: only 12 on one day");
  ok((await day(D2)).burgers.nashville.limit === 12 && (await day(dayOffset(6))).burgers.nashville.limit === 30 && (await day(dayOffset(8))).burgers.nashville.limit === 30, "that day shows 12; the days either side stay 30");
  const f = await fill("nashville", D2, 12);
  ok(f.ok, "12 can be booked that day");
  ok((await book({ burger: "nashville", date: D2 })).body.code === "SOLD_OUT", "the 13th is refused");
  ok((await book({ burger: "nashville", date: dayOffset(8) })).body.ok, "the next day is unaffected");
  r = await setCap({ burger: "nashville", limit: 50, start: R1, end: R2 });
  ok(r.status === 200 && (await day(dayOffset(11))).burgers.nashville.limit === 50 && (await day(dayOffset(13))).burgers.nashville.limit === 30, "a range (3 days) can be raised to 50; the day after stays 30");
  const f50 = await fill("nashville", dayOffset(11), 50);
  ok(f50.ok && (await book({ burger: "nashville", date: dayOffset(11) })).body.code === "SOLD_OUT", "50 fit on a range day, the 51st doesn't");
  var ticketRes = await book({ burger: "nashville", date: dayOffset(12), quantity: 1 });
}

console.log("\nScheduled changes");
const S1 = dayOffset(15), S2 = dayOffset(16);
{
  const r = await setCap({ burger: "cheese", limit: 60, start: S1 });
  ok(r.status === 200, "Super Cheese: 60 a day from a future date");
  ok((await day(dayOffset(14))).burgers.cheese.limit === 34 && (await day(S1)).burgers.cheese.limit === 60, "the day before keeps 34; that date and later show 60");
  const o = await cap();
  const rule = o.rules.find((x) => x.start_date === S1 && x.daily_limit === 60);
  ok(rule && o.rules.some((x) => x.start_date === S1), "it is listed as a scheduled change");
  const rm = await delRule(rule.id);
  ok(rm.status === 200 && (await day(S1)).burgers.cheese.limit === 34, "removing it works → back to 34");
  // protected removal
  const r2 = await setCap({ burger: "cheese", limit: 60, start: S2 });
  const rule2 = (await cap()).rules.find((x) => x.start_date === S2);
  const bk = await fill("cheese", dayOffset(17), 50);
  ok(bk.ok, "50 booked under the scheduled 60");
  const rm2 = await delRule(rule2.id);
  ok(rm2.status === 409 && rm2.body.code === "BELOW_BOOKED", "removing it is refused — 50 booked, the earlier limit is 34", JSON.stringify(rm2.body));
  ok((await cap()).rules.some((x) => x.id === rule2.id), "…the schedule is still there");
  for (const [id] of bk.ids.slice(0, 8)) await cancel(id); // 16 freed → 34 booked
  ok((await delRule(rule2.id)).status === 200, "after cancelling enough bookings, removal works");
  // a change already in force can't be removed
  const active = (await cap()).rules.find((x) => x.start_date <= dayOffset(0) && x.daily_limit === 34);
  ok(active && (await delRule(active.id)).status === 404, "a change already in force can't be removed (it is history)");
}

console.log("\nReplaced settings are labelled");
{
  const E1 = dayOffset(25);
  await setCap({ burger: "nashville", limit: 31, start: E1 });
  await setCap({ burger: "nashville", limit: 32, start: E1 });
  const o = await cap();
  const older = o.rules.find((r) => r.start_date === E1 && r.daily_limit === 31);
  const newer = o.rules.find((r) => r.start_date === E1 && r.daily_limit === 32);
  ok(older && newer && older.effective === false && newer.effective === true, "a scheduled setting that a newer one replaces is marked replaced (effective:false); the newer one is effective");
  ok((await day(E1)).burgers.nashville.limit === 32, "…and customers see the newer number (32)");
  ok((await delRule(older.id)).status === 200 && (await delRule(newer.id)).status === 200 && (await day(E1)).burgers.nashville.limit === 30, "both can be removed (they haven't started) → back to the default");
}

console.log("\nWhat customers read: copy, titles, tickets");
{
  // both burgers to 40 → headlines say 40
  const n40 = await setCap({ burger: "nashville", limit: 40 });
  ok(n40.status === 200, "Nashville general limit → 40 is accepted (the 50-burger special days are not in the way)", JSON.stringify(n40.body));
  ok((await day(D2)).burgers.nashville.limit === 12 && (await day(dayOffset(11))).burgers.nashville.limit === 50 && (await day(dayOffset(8))).burgers.nashville.limit === 40, "…special days keep their own numbers (12 and 50) while other days become 40");
  await setCap({ burger: "cheese", limit: 40 });
  const strip = (h) => h.replace(/<!--.*?-->/g, ""); // React puts invisible markers between adjacent text pieces
  const home = strip(await (await fetch(`${BASE}/`)).text());
  ok(/40 of each/.test(home) && /40 ONLY\. EVERY DAY\./.test(home), "landing page headline says '40 of each' / '40 ONLY. EVERY DAY.'");
  ok(/80 BURGERS/.test(home) && />40</.test(home), "…and the '40 + 40 / 80 burgers' block");
  ok(/Only 40 available daily/.test(home), "…and the card facts");
  const cheeseHtml = strip(await (await fetch(`${BASE}/super-cheese`)).text());
  ok(/<title>[^<]*40 a day/.test(cheeseHtml), "Super Cheese page title says '40 a day'");
  ok(/40 BURGERS/.test(cheeseHtml.replace(/<!--.*?-->/g, "")) && /Only 40 are made each day/.test(cheeseHtml.replace(/<!--.*?-->/g, "")), "…and its headline + subtitle");
  ok(/content="[^"]*Only 40 Super Cheese Burgers and 40 Nashville/.test(home), "share/search description quotes 40 + 40");
  ok((await fetch(`${BASE}/opengraph-image`)).headers.get("content-type")?.includes("image/png"), "share image still renders");
  // different limits → honest wording
  await setCap({ burger: "cheese", limit: 45 });
  const mixed = strip(await (await fetch(`${BASE}/`)).text());
  ok(/Limited quantities of each/.test(mixed) && /LIMITED\. EVERY DAY\./.test(mixed) && />45</.test(mixed) && /85 BURGERS/.test(mixed), "different limits → '45 + 40 / 85 burgers' with honest 'limited' wording");
  // ticket on a special day says that day's number
  const t = await fetch(`${BASE}${ticketRes.body.url}`);
  const th = (await t.text()).replace(/<!--.*?-->/g, "");
  ok(/50 were made/.test(th), "a ticket for a 50-burger day says '50 were made'");
}

console.log("\nAdmin numbers follow the limits");
{
  const d = await fetch(`${BASE}/api/admin/data?from=${dayOffset(11)}&to=${dayOffset(11)}`, { headers: H }).then(J);
  ok(d.daily[0].burgers.nashville.limit === 50 && d.daily[0].burgers.nashville.sold === 50 && d.daily[0].burgers.nashville.remaining === 0, "daily sales row: 50 / 50 sold on the special day");
  const month = dayOffset(11).slice(0, 7);
  const c = await fetch(`${BASE}/api/admin/calendar?month=${month}`, { headers: H }).then(J);
  const cd = c.days.find((x) => x.date === dayOffset(11));
  ok(cd.burgers.nashville.limit === 50 && cd.burgers.nashville.sold === 50 && cd.burgers.cheese.limit >= 30, "calendar API: that day's limit is 50, sold 50");
  const o = await cap();
  ok(o.burgers.cheese.current === 45 && o.burgers.nashville.current === 40 && o.burgers.cheese.floor.claimed >= 34, "limits overview: today's numbers + the floor (most already booked)", JSON.stringify(o.burgers));
}

console.log("\nMany people at once, against a changed limit");
{
  await setCap({ burger: "nashville", limit: 25, start: dayOffset(20), end: dayOffset(20) });
  const D = dayOffset(20);
  const racers = await Promise.all(Array.from({ length: 40 }, () => book({ burger: "nashville", date: D, quantity: 1 })));
  const won = racers.filter((x) => x.body.ok).length;
  ok(won === 25, `40 people grab a 25-burger day at the same instant → exactly 25 succeed (got ${won})`);
  const dd = await day(D);
  ok(dd.burgers.nashville.claimed === 25 && dd.burgers.nashville.remaining === 0, "the day shows 25 / 25, never more");

  // an admin scale-down racing with bookings must never leave claimed > limit
  const D3 = dayOffset(22);
  const mixed = await Promise.all([
    ...Array.from({ length: 24 }, () => book({ burger: "cheese", date: D3, quantity: 1 })),
    setCap({ burger: "cheese", limit: 20, start: D3, end: D3 }),
    ...Array.from({ length: 24 }, () => book({ burger: "cheese", date: D3, quantity: 1 })),
  ]);
  const after = await day(D3);
  ok(after.burgers.cheese.claimed <= after.burgers.cheese.limit, `bookings racing a limit change never leave a day over its limit (${after.burgers.cheese.claimed} / ${after.burgers.cheese.limit})`);
}

console.log(`\n${fail === 0 ? "ALL PASSED" : "FAILURES"} — ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
