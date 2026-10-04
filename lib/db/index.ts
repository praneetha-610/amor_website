import { demoStore } from "./demo";
import { supabaseStore } from "./supabase";
import type { Store } from "./types";

export const hasSupabaseCredentials = Boolean(
  process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY,
);

/** True when running on the in-memory demo store. */
export const isDemoMode = !hasSupabaseCredentials;

/**
 * Picks the data store.
 *  • Credentials present  → Supabase (real).
 *  • No credentials       → DEMO MODE (in-memory, loud banner).
 *  • Production + no credentials + DEMO_MODE!=="true" → refuse (never silently
 *    run a live site on throw-away data).
 */
export function getStore(): Store {
  if (hasSupabaseCredentials) return supabaseStore;
  if (process.env.NODE_ENV === "production" && process.env.DEMO_MODE !== "true") {
    throw new Error(
      "Database not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or DEMO_MODE=true for a demo deployment).",
    );
  }
  return demoStore;
}
