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
import {
  HOLDS_INVENTORY,
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
    g.__amorDemo = { rows, idem: new Map() };
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
    const remaining = i.dailyLimit - claimed;

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
