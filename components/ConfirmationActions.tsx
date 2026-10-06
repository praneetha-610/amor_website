"use client";

import Link from "next/link";
import { useState } from "react";

interface Props {
  reservationId: string;
  burgerLabel: string; // "Super Cheese"
  name: string;
  dateISO: string; // YYYY-MM-DD
  dateLabel: string; // "October 4"
  quantity: number;
  whatsappNumber: string;
  location: string;
  hours: string;
  /** When set (pop-up mode) the last button opens the permanent ticket page instead of going home. */
  fullUrl?: string;
}

function esc(s: string) {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

export function ConfirmationActions(p: Props) {
  const [downloaded, setDownloaded] = useState(false);

  // Only what the cafe needs. No mobile number is put in the message.
  const message =
    `Hi Amor Fati, I just reserved:\n\n` +
    `Burger: ${p.burgerLabel}\nDate: ${p.dateLabel}\nQuantity: ${p.quantity}\nReservation ID: ${p.reservationId}\n\n` +
    `Name: ${p.name}`;
  const waHref = `https://wa.me/${p.whatsappNumber.replace(/\D/g, "")}?text=${encodeURIComponent(message)}`;

  function addToCalendar() {
    const d = p.dateISO.replace(/-/g, "");
    const next = new Date(Date.UTC(+p.dateISO.slice(0, 4), +p.dateISO.slice(5, 7) - 1, +p.dateISO.slice(8, 10) + 1))
      .toISOString().slice(0, 10).replace(/-/g, "");
    const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
    const ics = [
      "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Amor Fati//Limited Drop//EN", "CALSCALE:GREGORIAN",
      "BEGIN:VEVENT",
      `UID:${p.reservationId}@amorfati`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${d}`,
      `DTEND;VALUE=DATE:${next}`,
      `SUMMARY:${esc(`Amor Fati — ${p.burgerLabel} Burger ×${p.quantity}`)}`,
      `DESCRIPTION:${esc(`Reservation ${p.reservationId}. Show your confirmation at Amor Fati. Open ${p.hours}.`)}`,
      `LOCATION:${esc(p.location)}`,
      "END:VEVENT", "END:VCALENDAR",
    ].join("\r\n");
    const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `amor-fati-${p.reservationId}.ics`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setDownloaded(true);
  }

  return (
    <div className="ticket-actions">
      <a href={waHref} target="_blank" rel="noopener noreferrer" className="btn btn--whatsapp btn--lg btn--block">
        SEND CONFIRMATION TO WHATSAPP
      </a>
      <button type="button" className="btn btn--outline btn--lg btn--block" onClick={addToCalendar}>
        {downloaded ? "ADDED — CHECK YOUR DOWNLOADS" : "ADD TO CALENDAR"}
      </button>
      {p.fullUrl ? (
        <Link href={p.fullUrl} className="btn btn--ghost btn--lg btn--block">OPEN THIS TICKET AS A PAGE</Link>
      ) : (
        <Link href="/" className="btn btn--ghost btn--lg btn--block">BACK TO AMOR FATI</Link>
      )}
    </div>
  );
}
