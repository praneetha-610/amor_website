import type { BurgerKey } from "@/config/site";
import type { CapacityRule } from "@/lib/capacity";

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
  /** When staff marked it collected (the customer showed their ID). null if not collected. */
  collected_at: string | null;
  /** When an admin cancelled it. null if not cancelled. */
  cancelled_at: string | null;
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

export interface SetCapacityInput {
  burger: BurgerKey;
  start: string; // YYYY-MM-DD
  end: string | null; // null = onward
  limit: number;
}

export type SetCapacityResult =
  | { status: "ok"; rule: CapacityRule }
  | { status: "below_claimed"; date: string; claimed: number };

export type DeleteCapacityResult =
  | { status: "ok" }
  | { status: "not_found" }
  | { status: "below_claimed"; date: string; claimed: number; limit: number };

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
  /** All reservations booked with this mobile number (newest date first). Caller must check the name. */
  findByMobile(mobile: string): Promise<Reservation[]>;
  listReservations(filter: ListFilter): Promise<Reservation[]>;
  updateStatus(reservationId: string, status: ReservationStatus): Promise<Reservation | null>;
  /** Every daily-limit rule (see lib/capacity.ts). Empty if none were ever set. */
  listCapacityRules(): Promise<CapacityRule[]>;
  /** Add a rule — refused if any date it covers already has more booked than the new limit. */
  setCapacity(input: SetCapacityInput): Promise<SetCapacityResult>;
  /**
   * Remove a rule that has NOT started yet (rules already in force are history). Refused if falling back to
   * the earlier limit would leave a date with more booked than it allows. `defaults` = built-in limits per burger.
   */
  deleteCapacityRule(id: string, today: string, defaults: Record<BurgerKey, number>): Promise<DeleteCapacityResult>;
}
