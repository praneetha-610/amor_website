"use client";

import Link from "next/link";
import { BURGER_KEYS, getBurger, type BurgerKey } from "@/config/site";
import type { AvailabilityPayload } from "@/lib/inventory";
import { DayCounts } from "./DayCounts";
import { useAvailability } from "./useAvailability";

/** The landing page's live scarcity panel: real, database-backed numbers for today and the next 2 days (the full booking window is on /reserve). */
export function TodaysDrop({ initial }: { initial: AvailabilityPayload }) {
  const data = useAvailability(initial);
  return (
    <section className="today" aria-label="Live availability for today and the next two days">
      <header className="today__head">
        <span className="today__live"><i aria-hidden /> LIVE</span>
        <h2>TODAY&apos;S DROP</h2>
        <span className="today__sub">next 3 days</span>
      </header>
      {data.days.length === 0 ? (
        <p className="today__empty">Checking availability…</p>
      ) : (
        <ul className="today__list">
          {BURGER_KEYS.map((k) => {
            const cfg = getBurger(k);
            return (
              <li key={k} className={`today__burger today__burger--${k}`}>
                <Link href={`${cfg.path}#claim`} className="today__name">
                  <span className="today__dot" aria-hidden />
                  {cfg.displayName}
                  <span className="today__go" aria-hidden>→</span>
                </Link>
                <DayCounts burger={k} data={data} tone="dark" />
              </li>
            );
          })}
        </ul>
      )}
      <Link href="/reserve" className="today__all">See every date · booking is open {data.days.length || ""} days ahead →</Link>
    </section>
  );
}

/** Compact live counts for the burger cards (all three dates). */
export function CardCounts({ burger, initial, tone = "light" }: { burger: BurgerKey; initial: AvailabilityPayload; tone?: "light" | "dark" }) {
  const data = useAvailability(initial);
  return <DayCounts burger={burger} data={data} tone={tone} />;
}
