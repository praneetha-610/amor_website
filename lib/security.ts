import "server-only";
import { createHmac, randomInt, timingSafeEqual, createHash } from "node:crypto";
import { cookies } from "next/headers";

// ── Signing secret ─────────────────────────────────────────────
function secret(): string {
  const s = process.env.APP_SECRET;
  if (s) return s;
  if (process.env.NODE_ENV === "production") {
    throw new Error("APP_SECRET is not set. Generate one with: openssl rand -hex 32");
  }
  return "dev-only-secret-do-not-use-in-production";
}

function hmac(data: string): string {
  return createHmac("sha256", secret()).update(data).digest("hex");
}

function safeEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

// ── Reservation IDs & confirmation links ───────────────────────
// No 0/O/1/I/L — easy to read out loud at the counter.
const ID_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function newReservationId(): string {
  let s = "";
  for (let i = 0; i < 6; i++) s += ID_ALPHABET[randomInt(ID_ALPHABET.length)];
  return `AF-${s}`;
}

export const RESERVATION_ID_RE = /^AF-[A-Z0-9]{6}$/;

/** Unguessable proof that you made this booking — lets the confirmation page survive refresh. */
export function confirmationToken(reservationId: string): string {
  return hmac(`confirm:${reservationId}`).slice(0, 24);
}

export function verifyConfirmationToken(reservationId: string, token: string): boolean {
  return typeof token === "string" && token.length === 24 && safeEqual(token, confirmationToken(reservationId));
}

// ── Admin auth ─────────────────────────────────────────────────
export const ADMIN_COOKIE = "af_admin";
const SESSION_HOURS = 12;

/**
 * Admin password. Production: must be set. Demo/dev with none set: "demo"
 * (the login page tells you so — it is NOT secure, demo only).
 */
export function adminPassword(): string | null {
  if (process.env.ADMIN_PASSWORD) return process.env.ADMIN_PASSWORD;
  if (process.env.NODE_ENV !== "production") return "demo";
  return null;
}

export function checkAdminPassword(input: string): boolean {
  const pw = adminPassword();
  return pw !== null && safeEqual(input, pw);
}

export function createAdminSession(): { value: string; maxAge: number } {
  const exp = Math.floor(Date.now() / 1000) + SESSION_HOURS * 3600;
  return { value: `${exp}.${hmac(`admin:${exp}`)}`, maxAge: SESSION_HOURS * 3600 };
}

export async function isAdmin(): Promise<boolean> {
  if (adminPassword() === null) return false;
  const raw = (await cookies()).get(ADMIN_COOKIE)?.value;
  if (!raw) return false;
  const [exp, sig] = raw.split(".");
  if (!exp || !sig || !/^\d+$/.test(exp)) return false;
  if (Number(exp) < Date.now() / 1000) return false;
  return safeEqual(sig, hmac(`admin:${exp}`));
}

// ── Client IP ──────────────────────────────────────────────────
export function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}
