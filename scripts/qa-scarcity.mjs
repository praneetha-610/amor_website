/**
 * End-to-end test of Scarcity Control against a RUNNING server (fresh store: DEMO_SEED=false npm run dev).
 *     npm run qa:scarcity
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
  const res = await fetch(`${BASE}/api/reservations`, { method: "POST", headers: { "Content-Type": "application/json", "X-Forwarded-For": ip() }, body: JSON.stringify({ name: "Scar Tester", quantity: 1, consent: true, idempotencyKey: crypto.randomUUID(), mobile: mobile(), ...b }) });
  return { status: res.status, body: await res.json() };
}
const availability = async () => J(await fetch(`${BASE}/api/availability`, { headers: { "X-Forwarded-For": ip() } }));
const day = async (d) => (await availability()).days.find((x) => x.date === d);

const login = await fetch(`${BASE}/api/admin/login`, { method: "POST", headers: { "Content-Type": "application/json", "X-Forwarded-For": ip() }, body: JSON.stringify({ password: PW }) });
const cookie = (login.headers.get("set-cookie") || "").split(";")[0];
const H = { "Content-Type": "application/json", Cookie: cookie };
const post = (path, body, headers = H) => fetch(`${BASE}/api/admin/scarcity${path}`, { method: "POST", headers, body: JSON.stringify(body) }).then(async (r) => ({ status: r.status, body: await r.json() }));
const overview = (d, headers = H) => fetch(`${BASE}/api/admin/scarcity${d ? `?date=${d}` : ""}`, { headers }).then(async (r) => ({ status: r.status, body: await r.json() }));
const hold = (burger, date, op, amount, scope = "one") => post("/hold", { burger, date, scope, op, amount });
const settings = (b) => post("/settings", b);
const cancel = (id) => fetch(`${BASE}/api/admin/reservations/${id}`, { method: "PATCH", headers: H, body: JSON.stringify({ status: "cancelled" }) });

console.log(`\nScarcity Control · ${BASE}\n`);

const D = dayOffset(3), D2 = dayOffset(4), D3 = dayOffset(6);

console.log("Baseline");
{
  const o = await overview(D);
  ok(o.status === 200 && o.body.settings.enabled === false, "starts with scarcity OFF");
  ok(o.body.burgers.cheese.stock === 30 && o.body.burgers.cheese.booked === 0 && o.body.burgers.cheese.held === 0 && o.body.burgers.cheese.available === 30, "stock 30 / booked 0 / reserved 0 / available 30");
  ok((await day(D)).burgers.cheese.remaining === 30, "customers see 30");
}

console.log("\nThe walk-through (scenarios 1–9)");
let ids = [];
{
  const s = await settings({ enabled: true });
  ok(s.status === 200 && s.body.settings.enabled === true, "1 · scarcity mode ON");
  const h = await hold("cheese", D, "set_available", 20);
  ok(h.status === 200 && h.body.burgers.cheese.available === 20 && h.body.burgers.cheese.held === 10, "1 · availability set to 20 (10 hidden)", JSON.stringify(h.body.burgers?.cheese));
  const pub = await day(D);
  ok(pub.burgers.cheese.remaining === 20 && pub.burgers.cheese.limit === 20, "2 · website shows 20 burgers");
  ok(pub.burgers.nashville.remaining === 30, "…Nashville untouched (30)");
  for (let i = 0; i < 5; i++) { const r = await book({ burger: "cheese", date: D }); if (r.body.ok) ids.push(r.body.reservationId); }
  ok(ids.length === 5, "3 · five bookings confirmed");
  ok((await day(D)).burgers.cheese.remaining === 15, "4 · public availability drops to 15");
  const o = (await overview(D)).body.burgers.cheese;
  ok(o.booked === 5 && o.held === 10 && o.available === 15 && o.stock === 30, "…the four numbers stay apart (30 / 5 / 10 / 15)", JSON.stringify(o));
  const h2 = await hold("cheese", D, "hold", 5);
  ok(h2.status === 200 && (await day(D)).burgers.cheese.remaining === 10, "5/6 · admin hides 5 more → public 10");
  const h3 = await hold("cheese", D, "release", 5);
  ok(h3.status === 200 && (await day(D)).burgers.cheese.remaining === 15, "7/8 · admin releases 5 → public back to 15");
}

console.log("\nSold out, races, limits");
{
  let sold = 0;
  for (let i = 0; i < 15; i++) { const r = await book({ burger: "cheese", date: D }); if (r.body.ok) sold++; }
  ok(sold === 15, "9 · the last 15 public burgers are booked");
  const pub = await day(D);
  ok(pub.burgers.cheese.remaining === 0 && pub.burgers.cheese.status === "sold_out", "availability reaches 0 → SOLD OUT");
  const r = await book({ burger: "cheese", date: D });
  ok(r.status === 409 && r.body.code === "SOLD_OUT", "…and the server refuses another booking", JSON.stringify(r.body));
  const o = (await overview(D)).body.burgers.cheese;
  ok(o.booked === 20 && o.held === 10 && o.unallocated === 10, "…10 are still held (not sold, not lost)", JSON.stringify(o));

  // two customers, one last burger
  await hold("cheese", D2, "set_available", 1);
  const [a, b] = await Promise.all([book({ burger: "cheese", date: D2 }), book({ burger: "cheese", date: D2 })]);
  ok([a, b].filter((x) => x.body.ok).length === 1, "10 · two customers race for the last burger → exactly one wins", JSON.stringify([a.body.code, b.body.code]));
  ok((await day(D2)).burgers.cheese.remaining === 0, "…and it shows sold out");

  // 30 people at once against 10 available
  await hold("nashville", D2, "set_available", 10);
  const many = await Promise.all(Array.from({ length: 30 }, () => book({ burger: "nashville", date: D2 })));
  ok(many.filter((x) => x.body.ok).length === 10, "30 people at once, 10 available → exactly 10 succeed", String(many.filter((x) => x.body.ok).length));
}

console.log("\nGuards");
{
  const r = await hold("cheese", D3, "set_available", 31);
  ok(r.status === 409 && r.body.code === "TOO_MANY", "11 · can't make more available than the unbooked stock", JSON.stringify(r.body));
  const r2 = await hold("cheese", D3, "hold", 31);
  ok(r2.status === 409, "…can't hide more than is available");
  ok((await day(D3)).burgers.cheese.remaining === 30, "…and nothing changed");
  const bad = await hold("cheese", D3, "set_available", -1);
  ok(bad.status === 400, "negative numbers are refused");
  const past = await hold("cheese", dayOffset(-2), "hold", 5);
  ok(past.status === 400, "a date that isn't open for booking is refused");
  const far = await hold("cheese", dayOffset(60), "hold", 5);
  ok(far.status === 400, "a date outside the booking window is refused");
  const nb = await post("/hold", { burger: "burger", date: D3, scope: "one", op: "hold", amount: 1 });
  ok(nb.status === 400, "an unknown burger is refused");

  // 12 · unauthenticated
  const anon = { "Content-Type": "application/json" };
  const u1 = await post("/settings", { enabled: false }, anon);
  const u2 = await post("/hold", { burger: "cheese", date: D3, scope: "one", op: "sold_out", amount: 0 }, anon);
  const u3 = await overview(D3, anon);
  ok(u1.status === 401 && u2.status === 401 && u3.status === 401, "12 · no login → settings, holds and the overview are all refused (401)");
  ok((await overview(D3)).body.settings.enabled === true && (await day(D3)).burgers.cheese.remaining === 30, "…and nothing was changed");
  const wrong = await post("/settings", { enabled: false }, { ...anon, Cookie: "amor_admin=forged" });
  ok(wrong.status === 401, "a forged cookie is refused too");
}

console.log("\nExisting bookings survive admin changes");
{
  const before = (await overview(D)).body.burgers.cheese.booked;
  await hold("cheese", D, "sold_out", 0);
  await hold("cheese", D, "restore", 0);
  await hold("cheese", D, "set_available", 0);
  const after = (await overview(D)).body.burgers.cheese;
  ok(after.booked === before && before === 20, "13 · 20 confirmed bookings are unchanged after sold-out / restore / set-to-0");
  const list = await fetch(`${BASE}/api/admin/data?from=${D}&to=${D}`, { headers: H }).then(J);
  const mine = (list.reservations ?? []).filter((r) => r.burger_type === "cheese" && r.status === "confirmed");
  ok(mine.length === 20, "…all 20 still confirmed in the admin list", String(mine.length));
}

console.log("\nCancellations");
{
  await hold("cheese", D, "set_available", 0);
  const o0 = (await overview(D)).body.burgers.cheese;
  await cancel(ids[0]); await cancel(ids[1]);
  const o1 = (await overview(D)).body.burgers.cheese;
  ok(o1.booked === o0.booked - 2 && o1.held === o0.held, "cancelling 2 bookings frees their stock; the hold doesn't change", JSON.stringify([o0, o1]));
  ok((await day(D)).burgers.cheese.remaining === 2, "…the 2 freed burgers go back on sale (public count 2), not to the hidden pile");
}

console.log("\nEvery day / persistence / OFF");
{
  const W = dayOffset(9);
  const r = await hold("nashville", W, "set_available", 8, "window");
  ok(r.status === 200 && r.body.days >= 20, `an "every day after" change reaches many days (${r.body.days})`);
  const a = await availability();
  const after = a.days.filter((x) => x.date >= W);
  ok(after.every((x) => x.burgers.nashville.remaining === 8), "…each of those days shows 8");
  ok(a.days.filter((x) => x.date < W && x.date !== D2).every((x) => x.burgers.nashville.remaining === 30), "…earlier days are untouched");
  const big = await hold("nashville", W, "set_available", 50, "window");
  ok(big.status === 200 && big.body.clamped === big.body.days, "an impossible number over many days is cut to what's possible (never over-exposes)");
  ok((await availability()).days.filter((x) => x.date >= W).every((x) => x.burgers.nashville.remaining === 30), "…so those days show 30, not 50");

  // persistence: brand-new requests see the same settings
  const o = (await overview(D)).body;
  ok(o.settings.enabled === true && o.settings.message.length > 0, "14 · settings persist across requests");
  ok((await availability()).scarcity.on === true, "…and the public site knows scarcity is ON");
  const msg = await settings({ message: "Only {count} left — {count} wow." });
  ok(msg.status === 200 && msg.body.settings.message === "Only {count} left — {count} wow.", "custom message saved");
  ok((await settings({ message: "x".repeat(300) })).status === 400, "a message over 160 characters is refused");
  ok((await settings({ message: "   " })).status === 400, "an empty message is refused");
  ok((await settings({ low_threshold: -3 })).status === 400 && (await settings({ low_threshold: "abc" })).status === 400, "a bad low-stock number is refused");
  ok((await settings({ low_threshold: 7 })).body.settings.low_threshold === 7, "low-stock threshold saved");

  // 15 · OFF → genuine
  await hold("cheese", D3, "set_available", 12);
  ok((await day(D3)).burgers.cheese.remaining === 12, "(scarcity ON: 12 shown)");
  await settings({ enabled: false });
  const off = await day(D3);
  ok(off.burgers.cheese.remaining === 30, "15 · scarcity OFF → the genuine 30 is shown", String(off.burgers.cheese.remaining));
  ok((await availability()).scarcity.on === false, "…and the public site knows it's OFF");
  const offD = await day(D);
  ok(offD.burgers.cheese.remaining === (await overview(D)).body.burgers.cheese.unallocated, "…genuine count = stock − booked");
  const ro = await book({ burger: "cheese", date: D3 });
  ok(ro.body.ok, "…and a booking works against the genuine stock");
  await settings({ enabled: true });
  ok((await day(D3)).burgers.cheese.remaining === 11, "turning ON again re-applies the hold (12 − the 1 just booked = 11)");
}

console.log("\nPrivacy + audit");
{
  const raw = JSON.stringify(await availability());
  ok(!/held|reserved|hold/i.test(raw), "the public availability data has no hold / reserved field at all");
  ok(Object.keys((await availability()).scarcity).sort().join() === "low,message,on", "…only { on, message, low } about scarcity is public");
  const html = await fetch(`${BASE}/reserve`).then((r) => r.text());
  ok(!/Scarcity Control|ADMIN RESERVED|adjust_hold/i.test(html), "the public booking page contains no admin controls");
  const a = (await overview(D)).body.audit;
  const acts = new Set(a.map((x) => x.action));
  for (const want of ["scarcity_enabled", "scarcity_disabled", "availability_set", "stock_reserved", "stock_released", "marked_sold_out", "availability_restored", "message_changed", "low_threshold_changed"]) {
    ok(acts.has(want), `audit log has “${want}”`);
  }
  ok(a.every((x) => x.actor === "admin" && x.at), "every entry has a time and an actor");
  const sold = a.find((x) => x.action === "stock_reserved");
  ok(sold && sold.previous && sold.next, "…with the previous and new values");
}

console.log(`\n${fail === 0 ? "ALL PASSED" : "FAILURES"} — ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
