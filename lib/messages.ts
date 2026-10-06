/** Every customer-facing error string lives here. Never show raw errors. */
export const MESSAGES = {
  SERVER: "Something went wrong. Please try again.",
  SOLD_OUT_DATE: "This drop has just sold out.",
  LAST_ONE_GONE: "SORRY — THAT LAST BURGER WAS JUST CLAIMED.",
  LAST_ONE_GONE_SUB: "Choose another date and claim yours.",
  DATE_UNAVAILABLE: "Reservations aren't available for this date.",
  INVALID_MOBILE: "Enter a valid 10-digit Indian mobile number.",
  INVALID_NAME: "Enter your full name (letters only, 2–60 characters).",
  INVALID_QUANTITY: (max: number) => `Choose between 1 and ${max} burgers.`,
  DUPLICATE: "You already have a reservation for this date.",
  RATE_LIMITED: "Too many attempts. Please wait a few minutes and try again.",
  NOT_FOUND: "We couldn't find a reservation with that name and mobile number. Check the spelling and the number you booked with.",
  NOT_ENOUGH: (n: number) => `Only ${n} left for that date. Lower your quantity or choose another date.`,
} as const;

export type ErrorCode =
  | "VALIDATION"
  | "SOLD_OUT"
  | "NOT_ENOUGH"
  | "DATE_UNAVAILABLE"
  | "DUPLICATE"
  | "RATE_LIMITED"
  | "NOT_FOUND"
  | "SERVER";
