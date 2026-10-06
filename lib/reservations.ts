import "server-only";
import { getBurger, reservationTotal, siteConfig } from "@/config/site";
import { isBookableDate } from "@/lib/dates";
import { getStore } from "@/lib/db";
import type { Reservation } from "@/lib/db/types";
import type { ErrorCode } from "@/lib/messages";
import { MESSAGES } from "@/lib/messages";
import { newReservationId } from "@/lib/security";
import { validateBooking, type FieldErrors } from "@/lib/validation";

export type BookingOutcome =
  | { ok: true; reservation: Reservation; replayed: boolean }
  | { ok: false; code: ErrorCode; message: string; remaining?: number; fieldErrors?: FieldErrors };

/** The only fields a customer-facing page ever receives. */
export interface PublicReservation {
  reservationId: string;
  name: string;
  burger: Reservation["burger_type"];
  date: string;
  quantity: number;
  status: Reservation["status"];
  createdAt: string;
  unitPrice: number;
  total: number;
}

export function toPublic(r: Reservation): PublicReservation {
  return {
    reservationId: r.reservation_id,
    name: r.customer_name,
    burger: r.burger_type,
    date: r.reservation_date,
    quantity: r.quantity,
    status: r.status,
    createdAt: r.created_at,
    unitPrice: r.unit_price ?? getBurger(r.burger_type).price,
    total: reservationTotal(r.burger_type, r.quantity, r.unit_price),
  };
}

/** Validate → check date → atomic DB booking. Never throws raw errors to callers' users. */
export async function bookBurger(raw: unknown): Promise<BookingOutcome> {
  const v = validateBooking(raw);
  if (!v.ok) {
    return { ok: false, code: "VALIDATION", message: Object.values(v.errors)[0] ?? MESSAGES.SERVER, fieldErrors: v.errors };
  }
  const input = v.value;

  if (!isBookableDate(input.date)) {
    return { ok: false, code: "DATE_UNAVAILABLE", message: MESSAGES.DATE_UNAVAILABLE };
  }

  const store = getStore();
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await store.createReservation({
      reservationId: newReservationId(),
      burger: input.burger,
      date: input.date,
      name: input.name,
      mobile: input.mobile,
      quantity: input.quantity,
      idempotencyKey: input.idempotencyKey,
      consent: input.consent,
      unitPrice: getBurger(input.burger).price, // server-side price — the client never sends one
      dailyLimit: getBurger(input.burger).dailyLimit,
      maxQuantity: siteConfig.maximumQuantityPerCustomer,
    });
    switch (res.status) {
      case "ok":
        return { ok: true, reservation: res.reservation, replayed: res.replayed };
      case "sold_out":
        return { ok: false, code: "SOLD_OUT", message: MESSAGES.LAST_ONE_GONE, remaining: 0 };
      case "not_enough":
        return { ok: false, code: "NOT_ENOUGH", message: MESSAGES.NOT_ENOUGH(res.remaining), remaining: res.remaining };
      case "duplicate":
        return { ok: false, code: "DUPLICATE", message: MESSAGES.DUPLICATE };
      case "consent_required":
        return { ok: false, code: "VALIDATION", message: siteConfig.noShowConsent.error, fieldErrors: { consent: siteConfig.noShowConsent.error } };
      case "retry":
        continue; // reservation_id collision → fresh ID
    }
  }
  return { ok: false, code: "SERVER", message: MESSAGES.SERVER };
}
