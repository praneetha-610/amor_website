/**
 * ═══════════════ DEMO MODE STORE (NOT A REAL DATABASE) ═══════════════
 * Used ONLY when SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are missing.
 * Data lives in server memory and disappears on restart.
 * The site shows a "DEMO MODE" banner whenever this store is active.
 *
 * ➜ To go live: add real Supabase credentials in .env.local
 *   (see lib/db/index.ts and lib/db/supabase.ts). Nothing else changes.
 *
 * Atomicity: JavaScript is single-threaded, and createReservation() has
 * NO `await` between "check inventory" and "insert", so two simultaneous
 * requests can never both pass the check for the last burger.
 * (The Supabase store achieves the same with a Postgres advisory lock.)
 */
import { randomUUID } from "node:crypto";
import { BURGER_KEYS, getBurger, type BurgerKey } from "@/config/site";
import { addDays, todayIST } from "@/lib/dates";
import { hasSpecificRule, resolveLimit, type CapacityRule } from "@/lib/capacity";
import { breakdown, computeHold, DEFAULT_SETTINGS, type ScarcitySettings } from "@/lib/scarcity";
import {
  HOLDS_INVENTORY,
  type AuditEntry,
  type ClaimedRow,
  type CreateInput,
  type CreateResult,
  type ListFilter,
  type Reservation,
  type ReservationStatus,
  type Store,
} from "./types";

interface DemoState {
  rows: Reservation[];
  idem: Map<string, string>; // idempotency key → reservation_id
  rules: CapacityRule[]; // admin-editable daily limits
  scarcity: ScarcitySettings;
  holds: Map<string, number>; // "burger|date" → held back by the owner
  audit: AuditEntry[];
}

const g = globalThis as unknown as { __amorDemo?: DemoState };

function seed(rows: Reservation[]) {
  if (process.env.DEMO_SEED === "false") return;
  const today = todayIST();
  // [day offset, burger, claimed so far]  — clearly fake, labelled "Demo Guest".
  const plan: [number, BurgerKey, number][] = [
    [0, "cheese", 13], [0, "nashville", 22],
    [1, "cheese", 4], [1, "nashville", 30],
    [2, "cheese", 21],
  ];
  let n = 0;
  for (const [offset, burger, claimed] of plan) {
    for (let i = 0; i < claimed; i++) {
      n++;
      rows.push({
        id: randomUUID(),
        reservation_id: `AF-DEMO${String(n).padStart(2, "0")}`,
        customer_name: `Demo Guest ${n}`,
        mobile_number: `90000${String(10000 + n).slice(-5)}`,
        burger_type: burger,
        reservation_date: addDays(today, offset),
        quantity: 1,
        status: "confirmed",
        created_at: new Date().toISOString(),
        unit_price: getBurger(burger).price,
        consent_accepted: true,
        consent_accepted_at: new Date().toISOString(),
        collected_at: null,
        cancelled_at: null,
      });
    }
  }
}

function state(): DemoState {
  if (!g.__amorDemo) {
    const rows: Reservation[] = [];
    seed(rows);
    g.__amorDemo = { rows, idem: new Map(), rules: [], scarcity: { ...DEFAULT_SETTINGS }, holds: new Map(), audit: [] };
  }
  return g.__amorDemo;
}

export const demoStore: Store = {
  kind: "demo",

  async claimedCounts(from, to) {
    const map = new Map<string, ClaimedRow>();
    for (const r of state().rows) {
      if (!HOLDS_INVENTORY(r.status) || r.reservation_date < from || r.reservation_date > to) continue;
      const k = `${r.burger_type}|${r.reservation_date}`;
      const cur = map.get(k) ?? { burger: r.burger_type, date: r.reservation_date, claimed: 0 };
      cur.claimed += r.quantity;
      map.set(k, cur);
    }
    return [...map.values()];
  },

  async createReservation(i: CreateInput): Promise<CreateResult> {
    // ── CRITICAL SECTION: no `await` below this line until return ──
    const s = state();

    if (i.consent !== true) return { status: "consent_required" };

    if (i.idempotencyKey) {
      const existing = s.idem.get(i.idempotencyKey);
      const row = existing && s.rows.find((r) => r.reservation_id === existing);
      if (row) return { status: "ok", reservation: row, replayed: true };
    }

    if (s.rows.some((r) => r.reservation_id === i.reservationId)) return { status: "retry" };

    if (
      s.rows.some(
        (r) =>
          r.mobile_number === i.mobile &&
          r.burger_type === i.burger &&
          r.reservation_date === i.date &&
          HOLDS_INVENTORY(r.status),
      )
    ) {
      return { status: "duplicate" };
    }

    const claimed = s.rows
      .filter((r) => r.burger_type === i.burger && r.reservation_date === i.date && HOLDS_INVENTORY(r.status))
      .reduce((n, r) => n + r.quantity, 0);
    // The limit for THIS date comes from the admin-editable rules (i.dailyLimit is only the fallback default).
    const stock = resolveLimit(s.rules, i.burger, i.date, i.dailyLimit);
    // Scarcity Control: stock the owner is holding back isn't for sale while scarcity mode is ON.
    const remaining = breakdown(stock, claimed, s.holds.get(`${i.burger}|${i.date}`) ?? 0, s.scarcity.enabled).available;

    if (remaining <= 0) return { status: "sold_out" };
    if (i.quantity > remaining) return { status: "not_enough", remaining };

    const reservation: Reservation = {
      id: randomUUID(),
      reservation_id: i.reservationId,
      customer_name: i.name,
      mobile_number: i.mobile,
      burger_type: i.burger,
      reservation_date: i.date,
      quantity: i.quantity,
      status: "confirmed",
      created_at: new Date().toISOString(),
      unit_price: i.unitPrice,
      consent_accepted: true,
      consent_accepted_at: new Date().toISOString(),
      collected_at: null,
      cancelled_at: null,
    };
    s.rows.push(reservation);
    if (i.idempotencyKey) s.idem.set(i.idempotencyKey, i.reservationId);
    return { status: "ok", reservation, replayed: false };
  },

  async getReservation(reservationId) {
    return state().rows.find((r) => r.reservation_id === reservationId) ?? null;
  },

  async findByMobile(mobile) {
    return state()
      .rows.filter((r) => r.mobile_number === mobile)
      .sort((a, b) => (a.reservation_date < b.reservation_date ? 1 : -1))
      .map((r) => ({ ...r }));
  },

  async listReservations({ from, to, q, status }: ListFilter) {
    const term = (q ?? "").trim();
    const digits = term.replace(/\D/g, "");
    // Same rule as the Supabase store: pick ONE field by the shape of the search.
    const kind = !term ? null : /^af/i.test(term) ? "id" : digits.length >= 3 && digits.length === term.replace(/[\s+\-]/g, "").length ? "mobile" : "idname";
    const idNeedle = term.toLowerCase().replace(/[^a-z0-9-]/g, "");
    return state()
      .rows.filter((r) => r.reservation_date >= from && r.reservation_date <= to)
      .filter((r) => !status || r.status === status)
      .filter((r) => {
        if (kind === null) return true;
        if (kind === "id") return r.reservation_id.toLowerCase().includes(idNeedle);
        if (kind === "mobile") return r.mobile_number.includes(digits);
        // anything else (e.g. "WWVNGU" — the ID without "AF-" — or "ravi"): match the ID OR the name
        return r.reservation_id.toLowerCase().includes(idNeedle) || r.customer_name.toLowerCase().includes(term.toLowerCase());
      })
      .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
      .map((r) => ({ ...r }));
  },

  async listCapacityRules() {
    return state().rules.map((r) => ({ ...r }));
  },

  async setCapacity({ burger, start, end, limit }) {
    // ── synchronous critical section (no await): the check and the insert are one indivisible step ──
    const s = state();
    // refuse if any covered date already holds more than the new limit (same rule as set_capacity() in SQL)
    const perDate = new Map<string, number>();
    for (const r of s.rows) {
      if (r.burger_type !== burger || !HOLDS_INVENTORY(r.status)) continue;
      if (r.reservation_date < start || (end !== null && r.reservation_date > end)) continue;
      // a general "onward" rule never overrides a specific-day rule, so those dates aren't affected (and aren't checked)
      if (end === null && hasSpecificRule(s.rules, burger, r.reservation_date)) continue;
      perDate.set(r.reservation_date, (perDate.get(r.reservation_date) ?? 0) + r.quantity);
    }
    const conflict = [...perDate.entries()].filter(([, n]) => n > limit).sort(([a], [b]) => (a < b ? -1 : 1))[0];
    if (conflict) return { status: "below_claimed" as const, date: conflict[0], claimed: conflict[1] };

    const last = s.rules.reduce((t, r) => Math.max(t, Date.parse(r.created_at)), 0);
    const rule: CapacityRule = {
      id: randomUUID(),
      burger_type: burger,
      start_date: start,
      end_date: end,
      daily_limit: limit,
      created_at: new Date(Math.max(Date.now(), last + 1)).toISOString(), // strictly increasing → "newest wins" is unambiguous
    };
    s.rules.push(rule);
    return { status: "ok" as const, rule: { ...rule } };
  },

  async deleteCapacityRule(id, today, defaults) {
    const s = state();
    const i = s.rules.findIndex((r) => r.id === id && r.start_date > today);
    if (i < 0) return { status: "not_found" as const };
    const rule = s.rules[i];
    const without = s.rules.filter((r) => r.id !== id);
    // would any covered date end up over its (earlier) limit?
    const perDate = new Map<string, number>();
    for (const r of s.rows) {
      if (r.burger_type !== rule.burger_type || !HOLDS_INVENTORY(r.status)) continue;
      if (r.reservation_date < rule.start_date || (rule.end_date !== null && r.reservation_date > rule.end_date)) continue;
      perDate.set(r.reservation_date, (perDate.get(r.reservation_date) ?? 0) + r.quantity);
    }
    const conflict = [...perDate.entries()]
      .map(([date, claimed]) => ({ date, claimed, limit: resolveLimit(without, rule.burger_type, date, defaults[rule.burger_type]) }))
      .filter((x) => x.claimed > x.limit)
      .sort((a, b) => (a.date < b.date ? -1 : 1))[0];
    if (conflict) return { status: "below_claimed" as const, ...conflict };
    s.rules.splice(i, 1);
    return { status: "ok" as const };
  },

  async getScarcity() {
    return { ...state().scarcity };
  },

  async saveScarcity(patch) {
    const s = state();
    const previous = { ...s.scarcity };
    s.scarcity = { ...s.scarcity, ...patch, updated_at: new Date().toISOString() };
    return { previous, current: { ...s.scarcity } };
  },

  async listHolds(from, to) {
    const out: { burger: BurgerKey; date: string; held: number }[] = [];
    for (const [k, held] of state().holds) {
      const [burger, date] = k.split("|");
      if (date >= from && date <= to) out.push({ burger: burger as BurgerKey, date, held });
    }
    return out;
  },

  async adjustHold({ burger, date, op, amount, defaultLimit, clamp }) {
    // synchronous critical section — nothing can book between the recount and the write
    const s = state();
    const stock = resolveLimit(s.rules, burger, date, defaultLimit);
    const booked = s.rows
      .filter((r) => r.burger_type === burger && r.reservation_date === date && HOLDS_INVENTORY(r.status))
      .reduce((n, r) => n + r.quantity, 0);
    const key = `${burger}|${date}`;
    const prev = breakdown(stock, booked, s.holds.get(key) ?? 0, true).held;
    const out = computeHold(op, amount, stock, booked, prev, clamp);
    if (!out.ok) return { status: "too_many" as const, max: out.max };
    if (out.held === 0) s.holds.delete(key);
    else s.holds.set(key, out.held);
    return { status: "ok" as const, limit: stock, claimed: booked, previous: prev, held: out.held, available: Math.max(0, stock - booked) - out.held };
  },

  async addAudit(e) {
    const s = state();
    s.audit.unshift({ ...e, id: randomUUID(), at: new Date().toISOString() });
    s.audit.length = Math.min(s.audit.length, 500);
  },

  async listAudit(limit) {
    return state().audit.slice(0, limit).map((a) => ({ ...a }));
  },

  async updateStatus(reservationId, status: ReservationStatus) {
    const r = state().rows.find((x) => x.reservation_id === reservationId);
    if (!r) return null;
    if (r.status === "cancelled") return { ...r }; // cancelled is final (it already released its burgers)
    r.status = status;
    r.collected_at = status === "completed" ? new Date().toISOString() : null;
    r.cancelled_at = status === "cancelled" ? new Date().toISOString() : null;
    return { ...r };
  },
};

export { BURGER_KEYS };
