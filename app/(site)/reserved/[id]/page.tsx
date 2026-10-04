import type { Metadata } from "next";
import Link from "next/link";
import { getBurger, siteConfig } from "@/config/site";
import { getStore } from "@/lib/db";
import { longDate, monthDay } from "@/lib/dates";
import { RESERVATION_ID_RE, verifyConfirmationToken } from "@/lib/security";
import { BurgerArt } from "@/components/BurgerArt";
import { ConfirmationActions } from "@/components/ConfirmationActions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "You got one",
  robots: { index: false, follow: false },
};

function Unavailable() {
  return (
    <section className="reserve">
      <div className="wrap reserve__inner">
        <h1 className="display-lg">WE CAN&apos;T OPEN THAT RESERVATION.</h1>
        <p className="lede">The link may be incomplete. Use your reservation ID and mobile number instead.</p>
        <Link href="/my-reservation" className="btn btn--ink btn--lg">FIND MY RESERVATION</Link>
      </div>
    </section>
  );
}

export default async function ConfirmationPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ k?: string }>;
}) {
  const { id } = await params;
  const { k } = await searchParams;
  // The token proves this link came from the booking itself — the ID alone reveals nothing.
  if (!RESERVATION_ID_RE.test(id) || !verifyConfirmationToken(id, k ?? "")) return <Unavailable />;

  let r;
  try {
    r = await getStore().getReservation(id);
  } catch {
    return (
      <section className="reserve"><div className="wrap reserve__inner">
        <h1 className="display-lg">SOMETHING WENT WRONG.</h1>
        <p className="lede">Something went wrong. Please try again.</p>
      </div></section>
    );
  }
  if (!r) return <Unavailable />;

  const cfg = getBurger(r.burger_type);
  const cancelled = r.status === "cancelled";
  const completed = r.status === "completed";
  const headline = cancelled ? "RESERVATION CANCELLED." : completed ? "ALREADY COLLECTED." : "YOU GOT ONE.";
  const label = cfg.shortName === "NASHVILLE" ? "Nashville" : "Super Cheese";

  return (
    <section className={`ticket theme-${r.burger_type}`}>
      <div className="wrap ticket__inner">
        <div className="ticket__hero">
          <p className="eyebrow ticket__kicker">{cancelled ? "NOT ACTIVE" : "RESERVED"}</p>
          <h1 className="ticket__title" data-state={r.status}>{headline}</h1>
          {!cancelled && !completed && (
            <p className="ticket__lede">
              {siteConfig.dailyLimit} were made.<br />You claimed yours.
            </p>
          )}
        </div>

        <article className="pass" aria-label="Reservation confirmation">
          <BurgerArt burger={r.burger_type} className="pass__art" />
          <p className="pass__burger">{cfg.name}</p>
          <dl className="pass__grid">
            <div><dt>RESERVED FOR</dt><dd>{r.customer_name}</dd></div>
            <div><dt>DATE</dt><dd>{longDate(r.reservation_date)}</dd></div>
            <div><dt>QUANTITY</dt><dd>{r.quantity}</dd></div>
            <div><dt>STATUS</dt><dd className="pass__status" data-status={r.status}>{r.status.replace("_", " ").toUpperCase()}</dd></div>
          </dl>
          <div className="pass__id">
            <span>RESERVATION ID</span>
            <strong>{r.reservation_id}</strong>
          </div>
          {!cancelled && !completed && (
            <p className="pass__show">SHOW THIS CONFIRMATION AT AMOR FATI</p>
          )}
        </article>

        {!cancelled && (
          <ConfirmationActions
            reservationId={r.reservation_id}
            burgerLabel={label}
            name={r.customer_name}
            dateISO={r.reservation_date}
            dateLabel={monthDay(r.reservation_date)}
            quantity={r.quantity}
            whatsappNumber={siteConfig.whatsappNumber}
            location={`${siteConfig.location.line1}, ${siteConfig.location.line2}`}
          />
        )}

        <aside className="ticket__where">
          <p className="eyebrow">WHERE</p>
          <address>
            <strong>{siteConfig.location.line1}</strong><br />
            {siteConfig.location.line2}<br />
            {siteConfig.location.hours}
          </address>
          <a href={siteConfig.location.mapUrl} target="_blank" rel="noopener noreferrer">Open in Maps ↗</a>
          <p className="ticket__note">Your reservation is valid only on {monthDay(r.reservation_date)}. Screenshot this page — you can also find it anytime under My Reservation.</p>
        </aside>
      </div>
    </section>
  );
}
