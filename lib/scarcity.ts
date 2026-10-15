/**
 * Scarcity Control — pure rules (no I/O), shared by the server, the demo store, the dashboard preview and the tests.
 *
 * Four numbers are kept apart, per burger per date:
 *   stock   the day's limit (what is physically made)
 *   booked  Σ non-cancelled reservations
 *   held    withheld by the owner — NOT sold, can be released any time
 *   public  what customers can book = stock − booked − held   (only while scarcity mode is ON)
 */
export const MAX_HOLD = 1000;
export const MAX_MESSAGE = 160;
export const DEFAULT_LOW_THRESHOLD = 5;

export type HoldOp = "set_available" | "hold" | "release" | "sold_out" | "restore";
export const HOLD_OPS: HoldOp[] = ["set_available", "hold", "release", "sold_out", "restore"];

export interface ScarcitySettings {
  enabled: boolean;
  message: string;
  low_threshold: number;
  updated_at: string | null;
}

export const PRESET_MESSAGES = [
  "Limited Drop — Only {count} Burgers Left.",
  "This Drop Is Almost Gone.",
  "Limited Quantities Available.",
  "Once This Drop Is Gone, It's Gone.",
  "The Current Drop Is Fully Booked.",
] as const;

export const DEFAULT_SETTINGS: ScarcitySettings = {
  enabled: false,
  message: PRESET_MESSAGES[0],
  low_threshold: DEFAULT_LOW_THRESHOLD,
  updated_at: null,
};

export interface Breakdown {
  stock: number;
  booked: number;
  /** held, never more than the stock that is still unbooked (a hold can't swallow a booking) */
  held: number;
  /** stock nobody has booked */
  unallocated: number;
  /** what the public can book (equals `unallocated` when scarcity is OFF) */
  available: number;
}

/** The one calculation everything uses. Never negative. */
export function breakdown(stock: number, booked: number, held: number, scarcityOn: boolean): Breakdown {
  const s = Math.max(0, Math.floor(stock));
  const b = Math.max(0, Math.floor(booked));
  const unallocated = Math.max(0, s - b);
  const h = Math.min(Math.max(0, Math.floor(held)), unallocated);
  return { stock: s, booked: b, held: h, unallocated, available: scarcityOn ? unallocated - h : unallocated };
}

export type AdjustOutcome = { ok: true; held: number } | { ok: false; max: number };

/** Mirrors adjust_hold() in supabase/schema.sql. `clamp` cuts an impossible request down instead of refusing it. */
export function computeHold(op: HoldOp, amount: number, stock: number, booked: number, currentHeld: number, clamp = false): AdjustOutcome {
  const b = breakdown(stock, booked, currentHeld, true);
  const avail = b.unallocated - b.held;
  switch (op) {
    case "set_available":
      if (amount > b.unallocated) return clamp ? { ok: true, held: 0 } : { ok: false, max: b.unallocated };
      return { ok: true, held: b.unallocated - amount };
    case "hold":
      if (amount > avail) return clamp ? { ok: true, held: b.unallocated } : { ok: false, max: avail };
      return { ok: true, held: b.held + amount };
    case "release":
      return { ok: true, held: Math.max(0, b.held - amount) };
    case "sold_out":
      return { ok: true, held: b.unallocated };
    case "restore":
      return { ok: true, held: 0 };
  }
}

/** Replace {count}. Always a clean, non-negative whole number. */
export function renderMessage(template: string, count: number): string {
  const n = Math.max(0, Math.floor(Number.isFinite(count) ? count : 0));
  return template.replace(/\{count\}/gi, String(n));
}

/** True if the template only makes sense with a number in it. */
export const usesCount = (template: string) => /\{count\}/i.test(template);

export function cleanMessage(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const m = raw.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  return m.length >= 1 && m.length <= MAX_MESSAGE ? m : null;
}

/** A message that says there is nothing left. It must never appear while there is stock. */
export const contradictsStock = (template: string) => /fully booked|sold out|all gone/i.test(template);

/** What the public booking page shows for one burger/date while scarcity is ON. */
export function publicStrip(s: { on: boolean; message: string; low: number }, available: number) {
  if (!s.on) return null;
  const n = Math.max(0, Math.floor(available));
  if (n <= 0) return { soldOut: true, urgent: false, headline: "SOLD OUT", message: "The current drop is fully booked." };
  return {
    soldOut: false,
    urgent: n <= s.low,
    headline: `ONLY ${n} ${n === 1 ? "BURGER" : "BURGERS"} AVAILABLE`,
    // {count} is always filled with the live number; a "fully booked / sold out" message is never shown while burgers remain
    message: contradictsStock(s.message) ? "" : renderMessage(s.message, n),
  };
}

export interface PublicScarcity {
  on: boolean;
  message: string;
  low: number;
}
