/**
 * Shared (client + server) validation. The server ALWAYS re-validates;
 * the client uses this only for instant feedback.
 */
import { siteConfig, isBurgerKey, type BurgerKey } from "@/config/site";
import { isValidISODate } from "@/lib/dates";
import { MESSAGES } from "@/lib/messages";

/** Strips +91 / 91 / 0 prefixes and separators → bare 10 digits (or best effort). */
export function normalizeMobile(input: string): string {
  let d = String(input ?? "").replace(/[\s\-().]/g, "");
  if (d.startsWith("+")) d = d.slice(1);
  if (d.length === 12 && d.startsWith("91")) d = d.slice(2);
  else if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
  return d;
}

/** Valid Indian mobile: 10 digits starting 6–9. */
export function isValidMobile(normalized: string): boolean {
  return /^[6-9]\d{9}$/.test(normalized);
}

/** Collapse whitespace, strip control chars and angle brackets. */
export function sanitizeName(input: string): string {
  return String(input ?? "")
    .replace(/[\u0000-\u001F\u007F<>]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function isValidName(name: string): boolean {
  return /^[\p{L}\p{M}][\p{L}\p{M} .'’-]{1,59}$/u.test(name);
}

export interface BookingInput {
  burger: BurgerKey;
  date: string;
  name: string;
  mobile: string; // normalized 10 digits
  quantity: number;
  idempotencyKey: string;
  /** Always true on a validated booking. */
  consent: true;
}

export type FieldErrors = Partial<Record<"burger" | "date" | "name" | "mobile" | "quantity" | "consent", string>>;

export function validateBooking(raw: unknown): { ok: true; value: BookingInput } | { ok: false; errors: FieldErrors } {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const errors: FieldErrors = {};

  const burger = r.burger;
  if (!isBurgerKey(burger)) errors.burger = "Choose a burger.";

  const date = typeof r.date === "string" ? r.date : "";
  if (!isValidISODate(date)) errors.date = MESSAGES.DATE_UNAVAILABLE;

  const name = sanitizeName(typeof r.name === "string" ? r.name : "");
  if (!isValidName(name)) errors.name = MESSAGES.INVALID_NAME;

  const mobile = normalizeMobile(typeof r.mobile === "string" ? r.mobile : "");
  if (!isValidMobile(mobile)) errors.mobile = MESSAGES.INVALID_MOBILE;

  const quantity = Number(r.quantity);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > siteConfig.maximumQuantityPerCustomer) {
    errors.quantity = MESSAGES.INVALID_QUANTITY(siteConfig.maximumQuantityPerCustomer);
  }

  // Must be the boolean `true` — "true", 1, or a missing field are all rejected.
  if (r.consent !== true) errors.consent = siteConfig.noShowConsent.error;

  const key = typeof r.idempotencyKey === "string" ? r.idempotencyKey : "";
  const idempotencyKey = /^[A-Za-z0-9-]{16,64}$/.test(key) ? key : "";

  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    value: { burger: burger as BurgerKey, date, name, mobile, quantity, idempotencyKey, consent: true },
  };
}
