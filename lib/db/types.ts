import type { BurgerKey } from "@/config/site";

export type ReservationStatus = "confirmed" | "cancelled" | "completed" | "no_show";
export const STATUSES: ReservationStatus[] = ["confirmed", "cancelled", "completed", "no_show"];

/**
 * Anything that is NOT cancelled holds a burger.
 * (completed = collected, no_show = made but not collected → both were produced.)
 * Staff can cancel a no_show/confirmed reservation to release the burger.
 */
export const HOLDS_INVENTORY = (s: ReservationStatus) => s !== "cancelled";

export interface Reservation {
  id: string;
  reservation_id: string; // AF-XXXXXX
  customer_name: string;
  mobile_number: string; // 10 digits
  burger_type: BurgerKey;
  reservation_date: string; // YYYY-MM-DD
  quantity: number;
  status: ReservationStatus;
  created_at: string; // ISO timestamp
  /** Price per burger (₹) at the moment of booking. null on bookings made before price snapshots existed. */
  unit_price: number | null;
  /** Customer ticked the no-show / pay-even-if-absent consent. */
  consent_accepted: boolean;
  consent_accepted_at: string | null;
}

export interface ClaimedRow {
  burger: BurgerKey;
  date: string;
  claimed: number;
}

export interface CreateInput {
  reservationId: string;
  burger: BurgerKey;
  date: string;
  name: string;
  mobile: string;
  quantity: number;
  idempotencyKey: string;
  /** Must be true — the store refuses otherwise (defence in depth). */
  consent: boolean;
  unitPrice: number;
  dailyLimit: number;
  maxQuantity: number;
}

export type CreateResult =
  | { status: "ok"; reservation: Reservation; replayed: boolean }
  | { status: "sold_out" }
  | { status: "not_enough"; remaining: number }
  | { status: "duplicate" }
  | { status: "consent_required" }
  | { status: "retry" }; // reservation_id collision — caller regenerates the ID

export interface ListFilter {
  from: string;
  to: string;
  q?: string;
  status?: ReservationStatus;
}

/**
 * The ONLY surface the rest of the app talks to.
 * Two implementations: Supabase (real) and in-memory (demo).
 */
export interface Store {
  readonly kind: "supabase" | "demo";
  /** Σ quantity of non-cancelled reservations per burger/date in range. */
  claimedCounts(from: string, to: string): Promise<ClaimedRow[]>;
  /** Atomic: check inventory + duplicate + insert as ONE indivisible step. */
  createReservation(input: CreateInput): Promise<CreateResult>;
  getReservation(reservationId: string): Promise<Reservation | null>;
  listReservations(filter: ListFilter): Promise<Reservation[]>;
  updateStatus(reservationId: string, status: ReservationStatus): Promise<Reservation | null>;
}
