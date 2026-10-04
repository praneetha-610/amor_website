import type { Metadata } from "next";
import { isBurgerKey, siteConfig } from "@/config/site";
import { getPublicAvailabilitySafe } from "@/lib/inventory";
import { BookingFlow } from "@/components/booking/BookingFlow";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Claim your burger",
  description: siteConfig.siteDescription,
  alternates: { canonical: "/reserve" },
};

export default async function ReservePage({
  searchParams,
}: {
  searchParams: Promise<{ burger?: string; date?: string }>;
}) {
  const sp = await searchParams;
  const availability = await getPublicAvailabilitySafe();
  const L = siteConfig.dailyLimit;
  return (
    <section className="reserve">
      <div className="wrap reserve__inner">
        <header className="reserve__head">
          <p className="eyebrow">{L} + {L} · EVERY DAY</p>
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
