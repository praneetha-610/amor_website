"use client";

import { useEffect, useRef } from "react";
import { lockScroll } from "@/lib/scroll-lock";
import { getBurger, siteConfig } from "@/config/site";
import { monthDay } from "@/lib/dates";
import { ConfirmationActions } from "../ConfirmationActions";
import { ReservationTicket, type TicketData } from "../ReservationTicket";

/**
 * The pop-up shown the instant a reservation succeeds: "YOU GOT ONE." + the ticket with the
 * big reservation ID. The customer screenshots it or shows the ID at the cafe, where staff
 * mark it collected in the admin panel.
 */
export function ConfirmedModal({ ticket, url, onClose }: { ticket: TicketData; url: string; onClose: () => void }) {
  const cfg = getBurger(ticket.burger);
  const boxRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const prevFocus = document.activeElement as HTMLElement | null;
    const unlock = lockScroll();
    boxRef.current?.scrollTo({ top: 0 });
    closeRef.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab" && boxRef.current) {
        // keep keyboard focus inside the dialog
        const f = boxRef.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled])');
        if (!f.length) return;
        const first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      unlock();
      prevFocus?.focus?.({ preventScroll: true });
    };
  }, [onClose]);

  return (
    <div className={`confirmed theme-${ticket.burger}`} role="dialog" aria-modal="true" aria-labelledby="confirmed-title">
      <div className="confirmed__box" ref={boxRef}>
        <button ref={closeRef} type="button" className="confirmed__close" onClick={onClose} aria-label="Close confirmation">✕</button>

        <header className="confirmed__head">
          <p className="eyebrow">RESERVED ✓</p>
          <h2 id="confirmed-title" className="confirmed__title">YOU GOT ONE.</h2>
          <p className="confirmed__lede">
            {siteConfig.dailyLimit} were made. You claimed {ticket.quantity > 1 ? `${ticket.quantity}` : "yours"}.
          </p>
        </header>

        <p className="confirmed__tip">
          <strong>📸 Screenshot this now.</strong> At Amor Fati, show this ID or the screenshot — we&apos;ll tick it off in our system.
        </p>

        <ReservationTicket t={ticket} compact />

        <ConfirmationActions
          reservationId={ticket.reservationId}
          burgerLabel={cfg.displayName}
          name={ticket.name}
          dateISO={ticket.date}
          dateLabel={monthDay(ticket.date)}
          quantity={ticket.quantity}
          whatsappNumber={siteConfig.whatsappNumber}
          location={`${siteConfig.location.line1}, ${siteConfig.location.line2}`}
          hours={siteConfig.location.hours}
          fullUrl={url}
        />

        <p className="confirmed__where">
          Come on <strong>{monthDay(ticket.date)}</strong> · {siteConfig.location.hours}
          <br />Lost it? <strong>My reservation</strong> finds it with your name and mobile number.
        </p>

        <button type="button" className="btn btn--ink btn--lg btn--block confirmed__done" onClick={onClose}>DONE</button>
      </div>
    </div>
  );
}
