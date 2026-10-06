import { formatPrice, getBurger, type BurgerKey } from "@/config/site";
import { longDate } from "@/lib/dates";
import { BurgerArt } from "./BurgerArt";

export interface TicketData {
  reservationId: string;
  name: string;
  burger: BurgerKey;
  date: string; // YYYY-MM-DD
  quantity: number;
  total: number;
  unitPrice: number;
  status: "confirmed" | "cancelled" | "completed" | "no_show";
}

/**
 * The "pass" the customer shows at the cafe (or screenshots). One component, used by the
 * pop-up right after booking AND by the permanent confirmation page, so they never drift apart.
 */
export function ReservationTicket({ t, compact = false }: { t: TicketData; compact?: boolean }) {
  const cfg = getBurger(t.burger);
  const active = t.status === "confirmed";
  return (
    <article className={`pass${compact ? " pass--compact" : ""}`} aria-label="Reservation confirmation" data-status={t.status}>
      <BurgerArt burger={t.burger} className="pass__art" />
      <p className="pass__burger">{cfg.name}</p>
      <dl className="pass__grid">
        <div><dt>RESERVED FOR</dt><dd>{t.name}</dd></div>
        <div><dt>DATE</dt><dd>{longDate(t.date)}</dd></div>
        <div><dt>QUANTITY</dt><dd>{t.quantity}</dd></div>
        <div>
          <dt>TOTAL AMOUNT</dt>
          <dd>
            {formatPrice(t.total)}
            {t.quantity > 1 && <small className="pass__each"> ({formatPrice(t.unitPrice)} each)</small>}
          </dd>
        </div>
        <div>
          <dt>STATUS</dt>
          <dd className="pass__status" data-status={t.status}>
            {t.status === "completed" ? "COLLECTED" : t.status.replace("_", " ").toUpperCase()}
          </dd>
        </div>
      </dl>
      <div className="pass__id" data-status={t.status}>
        <span>RESERVATION ID</span>
        <strong>{t.reservationId}</strong>
      </div>
      {active && (
        <>
          <p className="pass__show">SHOW THIS ID — OR A SCREENSHOT OF THIS — AT AMOR FATI</p>
          <p className="pass__held">Your burger has been reserved specifically for you.</p>
        </>
      )}
    </article>
  );
}
