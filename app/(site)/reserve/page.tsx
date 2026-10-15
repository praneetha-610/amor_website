import type { Metadata } from "next";
import { isBurgerKey, siteConfig, siteDescriptionFor } from "@/config/site";
import { getHeadlineLimits } from "@/lib/capacity-server";
import { getPublicAvailabilitySafe } from "@/lib/inventory";
import { BookingFlow } from "@/components/booking/BookingFlow";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return { title: "Claim your burger", description: siteDescriptionFor(await getHeadlineLimits()), alternates: { canonical: "/reserve" } };
}

export default async function ReservePage({
  searchParams,
}: {
  searchParams: Promise<{ burger?: string; date?: string }>;
}) {
  const sp = await searchParams;
  const availability = await getPublicAvailabilitySafe();
  const h = await getHeadlineLimits();
  return (
    <section className="reserve">
      <div className="wrap reserve__inner">
        <header className="reserve__head">
          <p className="eyebrow">{h.cheese} + {h.nashville} · EVERY DAY</p>
          <h1 className="display-xl">CLAIM<br />YOURS.</h1>
          <p className="lede">Pick a burger. Pick a date. We&apos;ll hold it for you.</p>
        </header>
        <BookingFlow
          initial={availability}
          initialBurger={isBurgerKey(sp.burger) ? sp.burger : undefined}
          initialDate={sp.date}
        />
      </div>
    </section>
  );
}
