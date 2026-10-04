import { siteConfig } from "@/config/site";

/** Honest scarcity copy. Always derived from the real remaining number. */
export function inventoryCopy(remaining: number, limit: number) {
  const claimed = Math.max(0, limit - remaining);
  const pct = limit > 0 ? Math.round((claimed / limit) * 100) : 100;
  const soldOut = remaining <= 0;
  const urgent = !soldOut && remaining < siteConfig.limitedThreshold;
  const almostGone = !soldOut && remaining < siteConfig.almostGoneThreshold;
  return {
    claimed,
    pct,
    soldOut,
    urgent,
    almostGone,
    headline: soldOut ? "SOLD OUT" : urgent ? `ONLY ${remaining} LEFT` : `${remaining} LEFT`,
    foot: soldOut
      ? "THIS DROP HAS SOLD OUT."
      : almostGone
        ? "THE DROP IS ALMOST GONE."
        : urgent
          ? "ONCE THEY'RE GONE, THEY'RE GONE."
          : "WHEN THEY'RE GONE, THEY'RE GONE.",
  };
}

export function statusText(s: "available" | "limited" | "sold_out") {
  return s === "sold_out" ? "SOLD OUT" : s === "limited" ? "LIMITED" : "AVAILABLE";
}
