"use client";

import { useEffect, useState } from "react";
import type { AvailabilityPayload } from "@/lib/inventory";
import type { BurgerKey } from "@/config/site";
import { relativeLabel, shortDate } from "@/lib/dates";
import { inventoryCopy } from "./inventory-copy";
import { firstBookableDay } from "./availability-utils";
import { useAvailability } from "./useAvailability";

/** Presentational meter: big count, animated bar, honest scarcity copy. */
export function InventoryMeter({
  remaining,
  limit,
  caption,
  size = "lg",
}: {
  remaining: number;
  limit: number;
  caption?: string;
  size?: "lg" | "sm";
}) {
  const c = inventoryCopy(remaining, limit);
  const [on, setOn] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setOn(true));
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <div className={`meter meter--${size}`} data-urgent={c.urgent || undefined} data-soldout={c.soldOut || undefined}>
      <p className="meter__kicker">
        ONLY {limit} AVAILABLE{caption ? <> · <span>{caption}</span></> : null}
      </p>
      <p className="meter__count" aria-live="polite">
        {c.soldOut ? (
          <span className="meter__big">SOLD OUT</span>
        ) : (
          <>
            <span className="meter__big">{c.urgent ? `ONLY ${remaining}` : remaining}</span>
            <span className="meter__of">{c.urgent ? "LEFT" : `/ ${limit} LEFT`}</span>
          </>
        )}
      </p>
      <div
        className="meter__bar"
        role="progressbar"
        aria-label={`${c.claimed} of ${limit} claimed`}
        aria-valuemin={0}
        aria-valuemax={limit}
        aria-valuenow={c.claimed}
      >
        <i style={{ width: on ? `${c.pct}%` : "0%" }} />
      </div>
      <p className="meter__foot">
        <span>{c.pct}% CLAIMED</span>
        <span>{c.foot}</span>
      </p>
    </div>
  );
}

/** Live (polling) meter for the next bookable day. Numbers come from the database via /api/availability. */
export function LiveInventory({
  burger,
  initial,
  size = "lg",
}: {
  burger: BurgerKey;
  initial: AvailabilityPayload;
  size?: "lg" | "sm";
}) {
  const data = useAvailability(initial);
  const day = firstBookableDay(data);
  if (!day) {
    return (
      <div className="meter meter--lg">
        <p className="meter__count"><span className="meter__big">CLOSED</span></p>
        <p className="meter__foot"><span>No dates are open for reservation right now.</span></p>
      </div>
    );
  }
  const b = day.burgers[burger];
  const when =
    day.date === data.today ? "TODAY" : `${relativeLabel(day.date, data.today)} · ${shortDate(day.date)}`;
  return <InventoryMeter remaining={b.remaining} limit={b.limit} caption={when} size={size} />;
}
