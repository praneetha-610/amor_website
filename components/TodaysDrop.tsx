"use client";

import Link from "next/link";
import { BURGER_KEYS, getBurger } from "@/config/site";
import type { AvailabilityPayload } from "@/lib/inventory";
import { relativeLabel, shortDate } from "@/lib/dates";
import { inventoryCopy } from "./inventory-copy";
import { firstBookableDay } from "./availability-utils";
import { useAvailability } from "./useAvailability";

/** The landing page's live scarcity panel: real, database-backed numbers. */
export function TodaysDrop({ initial }: { initial: AvailabilityPayload }) {
  const data = useAvailability(initial);
  const day = firstBookableDay(data);

  const title = !day
    ? "THE DROP"
    : day.date === data.today
      ? "TODAY'S DROP"
      : `${relativeLabel(day.date, data.today)}'S DROP · ${shortDate(day.date)}`;

  return (
    <section className="today" aria-label="Today's drop — live availability">
      <header className="today__head">
        <span className="today__live"><i aria-hidden /> LIVE</span>
        <h2>{title}</h2>
      </header>
      <ul className="today__list">
        {BURGER_KEYS.map((k) => {
          const cfg = getBurger(k);
          const b = day?.burgers[k];
          const c = b ? inventoryCopy(b.remaining, b.limit) : null;
          return (
            <li key={k}>
              <Link href={`${cfg.path}#claim`} className={`today__row today__row--${k}`}>
                <span className="today__dot" aria-hidden />
                <span className="today__name">{cfg.displayName}</span>
                <span className="today__num" data-soldout={c?.soldOut || undefined}>
                  {c ? (c.soldOut ? "SOLD OUT" : <><b>{b!.remaining} / {b!.limit}</b> left</>) : "—"}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Small live "17 LEFT TODAY" chip for cards and hero. */
export function LiveChip({ burger, initial }: { burger: import("@/config/site").BurgerKey; initial: AvailabilityPayload }) {
  const data = useAvailability(initial);
  const day = firstBookableDay(data);
  if (!day) return null;
  const b = day.burgers[burger];
  const c = inventoryCopy(b.remaining, b.limit);
  const when = day.date === data.today ? "TODAY" : relativeLabel(day.date, data.today);
  return (
    <span className="chip" data-soldout={c.soldOut || undefined}>
      {c.soldOut ? `SOLD OUT ${when}` : `${c.urgent ? "ONLY " : ""}${b.remaining} LEFT ${when}`}
    </span>
  );
}
