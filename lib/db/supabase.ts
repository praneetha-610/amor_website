/**
 * ═══════════════ REAL DATABASE (Supabase / PostgreSQL) ═══════════════
 * ➜ THIS is where your real credentials plug in:
 *     SUPABASE_URL=...                 (Project Settings → API)
 *     SUPABASE_SERVICE_ROLE_KEY=...    (Project Settings → API → service_role)
 *   Put them in .env.local (dev) or your host's env vars (prod).
 *   The key is server-only: this file is never imported by client code.
 *
 * Run supabase/schema.sql once in the Supabase SQL editor first.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { BurgerKey } from "@/config/site";
import type {
  ClaimedRow,
  CreateInput,
  CreateResult,
  ListFilter,
  Reservation,
  ReservationStatus,
  Store,
} from "./types";

let client: SupabaseClient | null = null;

function db(): SupabaseClient {
  if (!client) {
    client = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}

/**
 * We select "*" and pick the fields we want, so the site keeps working even if the newest
 * columns (collected_at / cancelled_at …) haven't been added to the database yet.
 * (Also keeps the internal idempotency_key out of every response.)
 */
const COLUMNS = "*";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toReservation(r: any): Reservation {
  return {
    id: r.id,
    reservation_id: r.reservation_id,
    customer_name: r.customer_name,
    mobile_number: r.mobile_number,
    burger_type: r.burger_type,
    reservation_date: r.reservation_date,
    quantity: r.quantity,
    status: r.status,
    created_at: r.created_at,
    unit_price: r.unit_price ?? null,
    consent_accepted: r.consent_accepted ?? false,
    consent_accepted_at: r.consent_accepted_at ?? null,
    collected_at: r.collected_at ?? null,
    cancelled_at: r.cancelled_at ?? null,
  };
}

export const supabaseStore: Store = {
  kind: "supabase",

  async claimedCounts(from, to) {
    const { data, error } = await db().rpc("claimed_counts", { p_from: from, p_to: to });
    if (error) throw error;
    return (data ?? []).map(
      (r: { burger_type: BurgerKey; reservation_date: string; claimed: number }): ClaimedRow => ({
        burger: r.burger_type,
        date: r.reservation_date,
        claimed: Number(r.claimed),
      }),
    );
  },

  /**
   * Overbooking protection lives IN the database: book_burger() takes a
   * per-(burger,date) advisory lock, recounts inventory and inserts inside
   * one transaction. See supabase/schema.sql.
   */
  async createReservation(i: CreateInput): Promise<CreateResult> {
    const { data, error } = await db().rpc("book_burger", {
      p_reservation_id: i.reservationId,
      p_burger: i.burger,
      p_date: i.date,
      p_name: i.name,
      p_mobile: i.mobile,
      p_quantity: i.quantity,
      p_daily_limit: i.dailyLimit,
      p_max_qty: i.maxQuantity,
      p_idempotency_key: i.idempotencyKey || null,
      p_consent: i.consent,
      p_unit_price: i.unitPrice,
    });
    if (error) throw error;
    switch (data?.status) {
      case "ok":
        return { status: "ok", reservation: toReservation(data.reservation), replayed: false };
      case "replayed":
        return { status: "ok", reservation: toReservation(data.reservation), replayed: true };
      case "sold_out":
        return { status: "sold_out" };
      case "not_enough":
        return { status: "not_enough", remaining: Number(data.remaining) };
      case "duplicate":
        return { status: "duplicate" };
      case "consent_required":
        return { status: "consent_required" };
      case "retry":
        return { status: "retry" };
      default:
        throw new Error("Unexpected book_burger response");
    }
  },

  async getReservation(reservationId) {
    const { data, error } = await db()
      .from("reservations")
      .select(COLUMNS)
      .eq("reservation_id", reservationId)
      .maybeSingle();
    if (error) throw error;
    return data ? toReservation(data) : null;
  },

  async findByMobile(mobile) {
    const { data, error } = await db()
      .from("reservations")
      .select(COLUMNS)
      .eq("mobile_number", mobile)
      .order("reservation_date", { ascending: false })
      .limit(50);
    if (error) throw error;
    return (data ?? []).map(toReservation);
  },

  async listReservations({ from, to, q, status }: ListFilter) {
    const base = () => {
      let query = db()
        .from("reservations")
        .select(COLUMNS)
        .gte("reservation_date", from)
        .lte("reservation_date", to)
        .order("created_at", { ascending: false })
        .limit(2000);
      if (status) query = query.eq("status", status);
      return query;
    };

    const term = (q ?? "").trim();
    if (!term) {
      const { data, error } = await base();
      if (error) throw error;
      return (data ?? []).map(toReservation);
    }

    // Pick the column(s) by the SHAPE of the search — separate queries, never hand-built filter strings.
    const digits = term.replace(/\D/g, "");
    const idLike = term.replace(/[^A-Za-z0-9-]/g, "");
    const nameLike = term.replace(/[^\p{L}\p{M}\p{N} .'’-]/gu, "");
    const isMobile = digits.length >= 3 && digits.length === term.replace(/[\s+\-]/g, "").length;

    const queries = isMobile
      ? [base().like("mobile_number", `%${digits}%`)]
      : /^af/i.test(term)
        ? [base().ilike("reservation_id", `%${idLike}%`)]
        : [base().ilike("reservation_id", `%${idLike}%`), base().ilike("customer_name", `%${nameLike}%`)];

    const results = await Promise.all(queries);
    const seen = new Map<string, Reservation>();
    for (const { data, error } of results) {
      if (error) throw error;
      for (const row of data ?? []) seen.set(row.reservation_id, toReservation(row));
    }
    return [...seen.values()].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  },

  async updateStatus(reservationId, status: ReservationStatus) {
    // Cancelled is terminal, so a status change can never silently re-take a released burger.
    const now = new Date().toISOString();
    const withStamps = {
      status,
      collected_at: status === "completed" ? now : null,
      cancelled_at: status === "cancelled" ? now : null,
    };
    const run = (patch: Record<string, unknown>) =>
      db().from("reservations").update(patch).eq("reservation_id", reservationId).neq("status", "cancelled").select(COLUMNS).maybeSingle();

    let { data, error } = await run(withStamps);
    // Database not upgraded yet (no collected_at / cancelled_at columns)? Still change the status.
    if (error && (error.code === "42703" || error.code === "PGRST204")) ({ data, error } = await run({ status }));
    if (error) throw error;
    if (data) return toReservation(data);
    return this.getReservation(reservationId);
  },
};
