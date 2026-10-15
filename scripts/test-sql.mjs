import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
/**
 * Runs the Supabase SQL on a real Postgres engine (PGlite) — no Supabase account needed.
 *   npm run test:sql
 * Covers: fresh install, upgrade of the previous live schema, re-running schema.sql, booking safety rules
 * (consent, double-submit, duplicates, overbooking) and the admin-editable daily limits.
 */
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
const P = fileURLToPath(new URL("../supabase/", import.meta.url));
// the schema as it was BEFORE daily limits (what an already-live database looks like)
const PREV = execSync("git show 1e7a47c:supabase/schema.sql", { cwd: fileURLToPath(new URL("..", import.meta.url)) }).toString().replace(/create extension if not exists pgcrypto;/g, "");
let pass = 0, fail = 0;
const ok = (c, l, x = "") => { c ? pass++ : fail++; console.log(`  ${c ? "✔" : "✘"} ${l}${c ? "" : "  " + x}`); };
const roles = "create role anon nologin; create role authenticated nologin; create role service_role nologin;";
let seq = 0;
const book = (db, burger, date, qty, mobile) => db.query(`select public.book_burger($1,$2,$3::date,$4,$5,$6,30,2,$7,true,329) r`, ["AF-T" + String(++seq).padStart(5, "0"), burger, date, "Test", mobile ?? "9" + String(1e8 + seq).slice(0, 9), qty, "k" + seq + "-" + Math.random().toString(36).slice(2)]).then(r => r.rows[0].r);
const setcap = (db, burger, s, e, n) => db.query(`select public.set_capacity($1,$2::date,$3::date,$4) r`, [burger, s, e, n]).then(r => r.rows[0].r);
const limitFor = (db, burger, d) => db.query(`select public.capacity_for($1,$2::date,30) l`, [burger, d]).then(r => r.rows[0].l);
const sold = (db, burger, d) => db.query(`select coalesce(sum(quantity),0)::int n from public.reservations where burger_type=$1 and reservation_date=$2::date and status<>'cancelled'`, [burger, d]).then(r => r.rows[0].n);
async function fill(db, burger, date, n) { let left = n; while (left > 0) { const q = Math.min(2, left); const r = await book(db, burger, date, q); if (r.status !== "ok") return r; left -= q; } return { status: "ok" }; }

async function suite(name, setup) {
  console.log(`\n${name}`);
  const db = new PGlite(); await db.exec(roles); await setup(db);

  ok(await limitFor(db, "cheese", "2026-10-20") === 30, "no rule → falls back to the built-in default (30)");

  // ── scale UP from a date onward
  let r = await setcap(db, "cheese", "2026-10-10", null, 40);
  ok(r.status === "ok" && r.id, "set 40/day from Oct 10 onward");
  ok(await limitFor(db, "cheese", "2026-10-09") === 30, "…the day BEFORE the start keeps 30 (history is preserved)");
  ok(await limitFor(db, "cheese", "2026-10-10") === 40 && await limitFor(db, "cheese", "2027-03-01") === 40, "…Oct 10 and every later date use 40");
  ok(await limitFor(db, "nashville", "2026-10-20") === 30, "…the OTHER burger is untouched");

  // booking honours the new limit
  r = await fill(db, "cheese", "2026-10-20", 40);
  ok(r.status === "ok" && await sold(db, "cheese", "2026-10-20") === 40, "40 Super Cheese can now be booked on Oct 20 (was 30)");
  r = await book(db, "cheese", "2026-10-20", 1);
  ok(r.status === "sold_out" && await sold(db, "cheese", "2026-10-20") === 40, "the 41st is refused → never exceeds the NEW limit");
  r = await fill(db, "cheese", "2026-10-09", 30);
  r = await book(db, "cheese", "2026-10-09", 1);
  ok(r.status === "sold_out", "Oct 9 (before the change) still sells out at 30");

  // ── scale DOWN is refused below what is already booked
  r = await setcap(db, "cheese", "2026-10-10", null, 35);
  ok(r.status === "below_claimed" && r.claimed === 40 && r.date === "2026-10-20", "scale down to 35 refused: Oct 20 already has 40 booked", JSON.stringify(r));
  const { rows: [{ n }] } = await db.query("select count(*)::int n from public.capacity_rules");
  ok(n === 1, "a refused change stores nothing");
  r = await setcap(db, "cheese", "2026-10-10", null, 40);
  ok(r.status === "ok", "setting it exactly to the booked amount (40) is allowed");
  // cancel some → now lower is possible
  await db.query("update public.reservations set status='cancelled' where burger_type='cheese' and reservation_date='2026-10-20' and quantity=2 and reservation_id in (select reservation_id from public.reservations where burger_type='cheese' and reservation_date='2026-10-20' limit 5)");
  const now = await sold(db, "cheese", "2026-10-20");
  r = await setcap(db, "cheese", "2026-10-10", null, now);
  ok(r.status === "ok", `after cancelling some bookings, ${now}/day is allowed`);
  ok(await limitFor(db, "cheese", "2026-10-20") === now, "newest rule wins");

  // ── one-day override + range override, and the booking function respects them
  r = await setcap(db, "nashville", "2026-10-24", "2026-10-24", 12);
  ok(r.status === "ok" && await limitFor(db, "nashville", "2026-10-24") === 12 && await limitFor(db, "nashville", "2026-10-25") === 30, "Nashville Sat Oct 24 only: 12 (other days stay 30)");
  r = await fill(db, "nashville", "2026-10-24", 12);
  ok(r.status === "ok", "12 can be booked on that day");
  ok((await book(db, "nashville", "2026-10-24", 1)).status === "sold_out", "the 13th is refused on that day");
  ok((await book(db, "nashville", "2026-10-25", 1)).status === "ok", "…while the next day is unaffected");
  r = await setcap(db, "nashville", "2026-10-26", "2026-10-28", 50);
  ok(r.status === "ok" && [26, 27, 28].every(async d => true) && await limitFor(db, "nashville", "2026-10-27") === 50 && await limitFor(db, "nashville", "2026-10-29") === 30, "range Oct 26–28 → 50, Oct 29 back to 30");
  // a general rule created LATER must NOT overwrite the earlier special day
  await setcap(db, "nashville", "2026-10-24", null, 45);
  ok(await limitFor(db, "nashville", "2026-10-24") === 12, "a later general rule does NOT overwrite a special day (specific-day rules win)");
  ok(await limitFor(db, "nashville", "2026-10-30") === 45 && await limitFor(db, "nashville", "2026-10-27") === 50, "…it applies to the other days (45), and the Oct 26–28 special range keeps 50");

  // ── the "can't go below what's booked" check only covers days the new rule would actually change
  await setcap(db, "cheese", "2028-05-05", "2028-05-05", 10);
  await fill(db, "cheese", "2028-05-05", 10);
  r = await setcap(db, "cheese", "2028-05-01", null, 5);
  ok(r.status === "ok", "a general limit of 5 is allowed even though a special day (own limit 10) has 10 booked");
  ok(await limitFor(db, "cheese", "2028-05-05") === 10 && await limitFor(db, "cheese", "2028-05-06") === 5, "…that special day keeps 10; other days use 5");
  await fill(db, "cheese", "2028-05-20", 5);
  r = await setcap(db, "cheese", "2028-05-01", null, 4);
  ok(r.status === "below_claimed" && r.date === "2028-05-20" && r.claimed === 5, "…but a day the general limit DOES govern is still protected (5 booked on May 20)", JSON.stringify(r));
  r = await setcap(db, "cheese", "2028-05-01", "2028-05-31", 3);
  ok(r.status === "below_claimed" && r.date === "2028-05-05", "a specific-day/range rule checks EVERY day it covers (May 5 has 10 booked)", JSON.stringify(r));

  // ── zero pauses a burger
  r = await setcap(db, "cheese", "2026-12-01", "2026-12-01", 0);
  ok(r.status === "ok" && (await book(db, "cheese", "2026-12-01", 1)).status === "sold_out", "limit 0 = nothing can be booked that day");

  // ── bounds + guards
  for (const [bad, label] of [[-1, "negative"], [1001, "above 1000"]]) { let thrown = false; try { await setcap(db, "cheese", "2026-11-01", null, bad); } catch { thrown = true; } ok(thrown, `${label} limit is rejected by the database`); }
  let thrown = false; try { await setcap(db, "cheese", "2026-11-05", "2026-11-01", 20); } catch { thrown = true; } ok(thrown, "end before start is rejected");
  thrown = false; try { await db.query("insert into public.capacity_rules(burger_type,start_date,daily_limit) values ('pizza','2026-11-01',5)"); } catch { thrown = true; } ok(thrown, "unknown burger is rejected");

  // past bookings never block a change that starts later
  await fill(db, "cheese", "2026-09-01", 30);
  r = await setcap(db, "cheese", "2026-11-01", null, 10);
  ok(r.status === "ok", "dates BEFORE the start date are not checked (Sep 1 had 30 booked; new limit 10 from Nov 1 is fine)");
  ok(await limitFor(db, "cheese", "2026-09-01") === 30, "…and Sep 1 keeps its original capacity");

  // ── removing a scheduled rule is protected too
  const delRule = (id) => db.query(`select public.delete_capacity_rule($1::uuid, $2::date, 30, 30) r`, [id, "2026-10-09"]).then(r => r.rows[0].r);
  const sched = await setcap(db, "nashville", "2026-12-10", null, 60);          // scheduled for the future (earlier rule: 45 from Oct 24)
  await fill(db, "nashville", "2026-12-12", 50);                                   // …and 50 get booked under it
  r = await delRule(sched.id);
  ok(r.status === "below_claimed" && r.claimed === 50 && r.limit === 45 && r.date === "2026-12-12", "removing a schedule is refused if bookings made under it would exceed the limit it falls back to", JSON.stringify(r));
  const exists = (await db.query("select count(*)::int n from public.capacity_rules where id=$1::uuid", [sched.id])).rows[0].n;
  ok(exists === 1, "…and the rule is still there");
  const sched2 = await setcap(db, "nashville", "2027-02-01", null, 70);          // another, with nothing booked under it
  r = await delRule(sched2.id);
  ok(r.status === "ok" && await limitFor(db, "nashville", "2027-02-10") === 60, "removing a schedule with nothing booked under it works, and the earlier rule applies again");
  r = await delRule("00000000-0000-0000-0000-000000000000");
  ok(r.status === "not_found", "removing an unknown rule → not_found");
  const started = (await db.query("select id from public.capacity_rules where start_date = '2026-10-10' limit 1")).rows[0];
  const lateToday = (await db.query(`select public.delete_capacity_rule($1::uuid, '2026-10-15'::date, 30, 30) r`, [started.id])).rows[0].r;
  ok(lateToday.status === "not_found", "a rule that has already started (today is after its start date) can NOT be removed — it is history");

  // ── security
  let denied = false; try { await db.exec("set role anon; select * from public.capacity_rules;"); } catch { denied = true; } await db.exec("reset role");
  ok(denied, "the public (anon) key cannot read the limits table");
  denied = false; try { await db.exec("set role anon; select public.set_capacity('cheese','2026-11-01',null,999);"); } catch { denied = true; } await db.exec("reset role");
  ok(denied, "the public (anon) key cannot change limits");
  denied = false; try { await db.exec("set role anon; select public.delete_capacity_rule('00000000-0000-0000-0000-000000000000','2026-01-01',30,30);"); } catch { denied = true; } await db.exec("reset role");
  ok(denied, "the public (anon) key cannot remove limits");
  denied = false; try { await db.exec("set role anon; select public.capacity_for('cheese','2026-11-01',30);"); } catch { denied = true; } await db.exec("reset role");
  ok(denied, "the public (anon) key cannot call capacity_for either");
}

await suite("FRESH INSTALL (supabase/schema.sql)", db => db.exec(fs.readFileSync(P + "schema.sql", "utf8")));
await suite("UPGRADE: current live schema → migration 005", async db => {
  await db.exec(PREV);
  await db.exec(fs.readFileSync(P + "migrations/005_daily_limits.sql", "utf8"));
});
await suite("UPGRADE: current live schema → re-run the WHOLE updated schema.sql", async db => {
  await db.exec(PREV);
  await db.exec(fs.readFileSync(P + "schema.sql", "utf8"));
  await db.exec(fs.readFileSync(P + "schema.sql", "utf8")); // twice = idempotent
});

// existing bookings survive the upgrade and still count
console.log("\nEXISTING BOOKINGS SURVIVE THE UPGRADE");
{
  const db = new PGlite(); await db.exec(roles); await db.exec(PREV);
  await db.query(`select public.book_burger('AF-OLD001','cheese','2026-10-12'::date,'Existing','9111111111',2,30,2,'old-1',true,329)`);
  await db.exec(fs.readFileSync(P + "migrations/005_daily_limits.sql", "utf8"));
  const { rows: [x] } = await db.query("select quantity, status from public.reservations where reservation_id='AF-OLD001'");
  ok(x.quantity === 2 && x.status === "confirmed", "an existing booking is untouched");
  const r = await setcap(db, "cheese", "2026-10-01", null, 1);
  ok(r.status === "below_claimed" && r.claimed === 2, "…and it counts when someone tries to scale below it");
}


console.log("\nBOOKING SAFETY (unchanged rules still hold)");
{
  const db = new PGlite(); await db.exec(roles); await db.exec(fs.readFileSync(P + "schema.sql", "utf8"));
  const call = (a) => db.query(`select public.book_burger($1,$2,$3::date,$4,$5,$6,30,2,$7,$8,329) r`, a).then(r => r.rows[0].r);
  let r = await call(["AF-R00001", "cheese", "2026-10-20", "Tester", "9000000001", 1, "key-r1", true]);
  ok(r.status === "ok" && r.reservation.consent_accepted === true && !("idempotency_key" in r.reservation), "booking with consent works; idempotency key not leaked");
  ok((await call(["AF-R00002", "cheese", "2026-10-20", "Tester", "9000000002", 1, "key-r2", false])).status === "consent_required", "no consent → refused by the DATABASE");
  const again = await call(["AF-R00003", "cheese", "2026-10-20", "Tester", "9000000001", 1, "key-r1", true]);
  ok(again.status === "replayed" && again.reservation.reservation_id === "AF-R00001", "same idempotency key → original returned (no 2nd row)");
  ok((await call(["AF-R00004", "cheese", "2026-10-20", "Tester", "9000000001", 1, "key-r4", true])).status === "duplicate", "same mobile + burger + date → duplicate");
  let q = false; try { await call(["AF-R00005", "cheese", "2026-10-20", "Tester", "9000000003", 3, "key-r5", true]); } catch { q = true; } ok(q, "quantity above the per-customer max is rejected");
  for (let i = 0; i < 14; i++) await call([`AF-S${String(i).padStart(5, "0")}`, "cheese", "2026-10-21", "Tester", `97000000${String(10 + i)}`, 2, `ks${i}`, true]);
  ok((await call(["AF-S00099", "cheese", "2026-10-21", "Tester", "9700000099", 2, "ks99", true])).status === "ok", "30th burger accepted");
  ok((await call(["AF-S00100", "cheese", "2026-10-21", "Tester", "9700000100", 1, "ks100", true])).status === "sold_out", "31st refused → default limit 30 holds when no rule exists");
}

// ─────────────────────────────────────────────── Scarcity Control ───────────────────────────────────────────────
const adj = (db, burger, d, op, n = 0, clamp = false) => db.query(`select public.adjust_hold($1,$2::date,$3,$4,30,$5) r`, [burger, d, op, n, clamp]).then(r => r.rows[0].r);
const scarcityOn = (db, on) => db.query("update public.scarcity_settings set enabled=$1 where id=1", [on]);
const heldOf = (db, burger, d) => db.query("select coalesce(max(held),0)::int h from public.scarcity_holds where burger_type=$1 and hold_date=$2::date", [burger, d]).then(r => r.rows[0].h);

async function scarcitySuite(name, setup) {
  console.log(`\nSCARCITY CONTROL · ${name}`);
  const db = new PGlite(); await db.exec(roles); await setup(db);
  const D = "2026-11-05";

  const { rows: [st] } = await db.query("select enabled, message, low_threshold from public.scarcity_settings where id=1");
  ok(st.enabled === false && st.low_threshold === 5 && /\{count\}/.test(st.message), "settings row exists, scarcity OFF by default");

  // a hold has no effect while scarcity is OFF
  let r = await adj(db, "cheese", D, "set_available", 20);
  ok(r.status === "ok" && r.held === 10 && r.available === 20 && r.limit === 30 && r.claimed === 0, "set_available 20 of 30 → 10 held", JSON.stringify(r));
  r = await book(db, "cheese", D, 1);
  ok(r.status === "ok", "scarcity OFF → the hold is ignored (genuine stock is on sale)");
  await db.query("update public.reservations set status='cancelled'"); // reset

  // ON: only 20 sellable
  await scarcityOn(db, true);
  let n = 0; for (let i = 0; i < 25; i++) { const x = await book(db, "cheese", D, 1); if (x.status === "ok") n++; }
  ok(n === 20, "scarcity ON → exactly 20 can be booked, not 30", String(n));
  r = await book(db, "cheese", D, 1);
  ok(r.status === "sold_out", "the 21st is refused by the DATABASE");
  ok(await sold(db, "cheese", D) === 20 && await heldOf(db, "cheese", D) === 10, "booked 20 + held 10 = stock 30, kept separate");

  // the four numbers after changes
  r = await adj(db, "cheese", D, "release", 5);
  ok(r.status === "ok" && r.previous_held === 10 && r.held === 5 && r.available === 5, "release 5 → 5 more on sale", JSON.stringify(r));
  r = await adj(db, "cheese", D, "hold", 3);
  ok(r.held === 8 && r.available === 2, "hide 3 → 2 on sale");
  r = await adj(db, "cheese", D, "hold", 3);
  ok(r.status === "too_many" && r.max === 2, "can't hide more than is on sale", JSON.stringify(r));
  r = await adj(db, "cheese", D, "set_available", 31);
  ok(r.status === "too_many" && r.max === 10, "can't make 31 available when only 10 are unbooked", JSON.stringify(r));
  ok(await heldOf(db, "cheese", D) === 8, "…a refused change stores nothing");
  r = await adj(db, "cheese", D, "set_available", 99, true);
  ok(r.status === "ok" && r.held === 0 && r.available === 10, "clamp mode cuts 99 down to what's possible (all 10)");
  r = await adj(db, "cheese", D, "sold_out");
  ok(r.held === 10 && r.available === 0, "sold_out hides everything left (10)");
  ok((await book(db, "cheese", D, 1)).status === "sold_out", "…and booking is refused");
  ok(await sold(db, "cheese", D) === 20, "20 confirmed bookings were never touched");
  r = await adj(db, "cheese", D, "restore");
  ok(r.held === 0 && r.available === 10 && await heldOf(db, "cheese", D) === 0, "restore → nothing hidden, row removed");
  ok((await book(db, "cheese", D, 2)).status === "ok", "…and the released stock sells");

  // cancellation returns stock to the PUBLIC, the hold stays put
  const D2 = "2026-11-06";
  await adj(db, "nashville", D2, "set_available", 4);
  await fill(db, "nashville", D2, 4);
  ok((await book(db, "nashville", D2, 1)).status === "sold_out", "nashville: 4 sold of 4 available");
  await db.query("update public.reservations set status='cancelled' where burger_type='nashville' and reservation_date=$1::date and quantity=2 and reservation_id=(select reservation_id from public.reservations where burger_type='nashville' and reservation_date=$1::date limit 1)", [D2]);
  ok(await heldOf(db, "nashville", D2) === 26, "cancelling a booking doesn't change the held amount (26)");
  ok((await book(db, "nashville", D2, 2)).status === "ok", "…the freed 2 burgers go back on sale");

  // hold survives a lower daily limit and never swallows bookings
  const D3 = "2026-11-07";
  await adj(db, "cheese", D3, "hold", 20); await fill(db, "cheese", D3, 6);
  r = await setcap(db, "cheese", D3, D3, 10);
  ok(r.status === "ok", "daily limit lowered to 10 (6 booked, 20 held)");
  r = await adj(db, "cheese", D3, "hold", 0);
  ok(r.available === 0 && r.held === 4 && r.claimed === 6, "held is capped to the unbooked 4 — it can't eat the 6 bookings", JSON.stringify(r));
  ok((await book(db, "cheese", D3, 1)).status === "sold_out", "…nothing is sellable");

  // many at once
  const D4 = "2026-11-08";
  await adj(db, "cheese", D4, "set_available", 3);
  const batch = await Promise.all(Array.from({ length: 12 }, () => book(db, "cheese", D4, 1)));
  ok(batch.filter(x => x.status === "ok").length === 3, "12 simultaneous bookings, 3 available → exactly 3 succeed");

  // lock-down
  for (const [label, sql] of [
    ["adjust_hold", "select public.adjust_hold('cheese','2026-11-09','sold_out',0,30,false)"],
    ["scarcity_settings", "select * from public.scarcity_settings"],
    ["scarcity_holds", "select * from public.scarcity_holds"],
    ["admin_audit", "select * from public.admin_audit"],
    ["write scarcity_settings", "update public.scarcity_settings set enabled=false"],
  ]) {
    let denied = false; try { await db.exec(`set role anon; ${sql};`); } catch { denied = true; } await db.exec("reset role");
    ok(denied, `the public (anon) key cannot use ${label}`);
  }
  let bad = false; try { await adj(db, "cheese", D, "nope", 1); } catch { bad = true; } ok(bad, "an unknown action is rejected");
  bad = false; try { await db.query("insert into public.scarcity_settings (id) values (2)"); } catch { bad = true; } ok(bad, "only one settings row can exist");
  bad = false; try { await db.query("insert into public.scarcity_holds values ('pizza','2026-11-01',1)"); } catch { bad = true; } ok(bad, "a hold for an unknown burger is rejected");
  await db.query("insert into public.admin_audit (actor, action, burger_type, hold_date, previous, new) values ('admin','stock_reserved','cheese','2026-11-01','{\"held\":0}','{\"held\":5}')");
  const { rows: [au] } = await db.query("select actor, previous->>'held' p, new->>'held' n, at is not null t from public.admin_audit limit 1");
  ok(au.actor === "admin" && au.p === "0" && au.n === "5" && au.t, "the audit log stores who, when, previous and new");
}

await scarcitySuite("fresh install (schema.sql)", db => db.exec(fs.readFileSync(P + "schema.sql", "utf8")));
await scarcitySuite("upgrade: live schema → 005 → migration 006", async db => {
  await db.exec(PREV);
  await db.exec(fs.readFileSync(P + "migrations/005_daily_limits.sql", "utf8"));
  await db.exec(fs.readFileSync(P + "migrations/006_scarcity_control.sql", "utf8"));
  await db.exec(fs.readFileSync(P + "migrations/006_scarcity_control.sql", "utf8")); // twice = idempotent
});
await scarcitySuite("upgrade: live schema → whole schema.sql, twice", async db => {
  await db.exec(PREV);
  await db.exec(fs.readFileSync(P + "schema.sql", "utf8"));
  await db.exec(fs.readFileSync(P + "schema.sql", "utf8"));
});

console.log("\nEXISTING BOOKINGS SURVIVE MIGRATION 006");
{
  const db = new PGlite(); await db.exec(roles); await db.exec(fs.readFileSync(P + "schema.sql", "utf8"));
  const before = fs.readFileSync(P + "migrations/006_scarcity_control.sql", "utf8");
  await book(db, "cheese", "2026-11-12", 2, "9222222222");
  await db.exec(before);
  const { rows: [x] } = await db.query("select quantity, status from public.reservations where burger_type='cheese' and reservation_date='2026-11-12'");
  ok(x.quantity === 2 && x.status === "confirmed", "an existing booking is untouched by the migration");
  ok((await adj(db, "cheese", "2026-11-12", "set_available", 29)).status === "too_many", "…and it counts as booked (29 > 28 unbooked)");
}

console.log(`\n${fail ? "FAILURES" : "ALL PASSED"} — ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
