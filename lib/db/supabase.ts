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

const COLUMNS =
  "id, reservation_id, customer_name, mobile_number, burger_type, reservation_date, quantity, status, created_at, unit_price, consent_accepted, consent_accepted_at";

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
        return { status: "ok", reservation: data.reservation as Reservation, replayed: false };
      case "replayed":
        return { status: "ok", reservation: data.reservation as Reservation, replayed: true };
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
    return (data as Reservation | null) ?? null;
  },

  async listReservations({ from, to, q, status }: ListFilter) {
    let query = db()
      .from("reservations")
      .select(COLUMNS)
      .gte("reservation_date", from)
      .lte("reservation_date", to)
      .order("created_at", { ascending: false })
      .limit(2000);
    if (status) query = query.eq("status", status);

    const term = (q ?? "").trim();
    if (term) {
      const digits = term.replace(/\D/g, "");
      // Pick ONE column by the shape of the search — avoids hand-built .or() filter strings.
      if (/^af/i.test(term)) {
        query = query.ilike("reservation_id", `%${term.replace(/[^A-Za-z0-9-]/g, "")}%`);
      } else if (digits.length >= 3 && digits.length === term.replace(/[\s+\-]/g, "").length) {
        query = query.like("mobile_number", `%${digits}%`);
      } else {
        query = query.ilike("customer_name", `%${term.replace(/[^\p{L}\p{M}\p{N} .'’-]/gu, "")}%`);
      }
    }
    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []) as Reservation[];
  },

  async updateStatus(reservationId, status: ReservationStatus) {
    // Cancelled is terminal, so a status change can never silently re-take a released burger.
    const { data, error } = await db()
      .from("reservations")
      .update({ status })
      .eq("reservation_id", reservationId)
      .neq("status", "cancelled")
      .select(COLUMNS)
      .maybeSingle();
    if (error) throw error;
    if (data) return data as Reservation;
    return this.getReservation(reservationId);
  },
};
