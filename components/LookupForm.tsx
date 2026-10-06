"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { formatPrice } from "@/config/site";
import { longDate } from "@/lib/dates";
import { MESSAGES } from "@/lib/messages";

interface Found {
  reservationId: string;
  name: string;
  burgerName: string;
  date: string;
  quantity: number;
  total: number;
  status: "confirmed" | "cancelled" | "completed" | "no_show";
  url: string;
}

const LABEL = { confirmed: "RESERVED", completed: "COLLECTED", cancelled: "CANCELLED", no_show: "NO SHOW" } as const;

/** "My reservation": name + mobile number only — the ID comes back to them in the results. */
export function LookupForm() {
  const uid = useId();
  const [name, setName] = useState("");
  const [mobile, setMobile] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [found, setFound] = useState<Found[] | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setErr("");
    setFound(null);
    try {
      const res = await fetch("/api/reservations/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, mobile }),
      });
      const out = await res.json().catch(() => null);
      if (res.ok && out?.reservations) setFound(out.reservations);
      else setErr(out?.message ?? MESSAGES.SERVER);
    } catch {
      setErr(MESSAGES.SERVER);
    }
    setBusy(false);
  }

  return (
    <>
      <form onSubmit={submit} className="form form--lookup" noValidate>
        <div className="field">
          <label htmlFor={`${uid}-n`}>FULL NAME</label>
          <input id={`${uid}-n`} name="name" autoComplete="name" autoCapitalize="words" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div className="field">
          <label htmlFor={`${uid}-m`}>MOBILE NUMBER</label>
          <div className="field__phone">
            <span aria-hidden>+91</span>
            <input id={`${uid}-m`} name="mobile" type="tel" inputMode="numeric" autoComplete="tel-national" value={mobile} onChange={(e) => setMobile(e.target.value.replace(/[^\d+\s-]/g, ""))} placeholder="98765 43210" maxLength={16} required />
          </div>
        </div>
        {err && <div className="form__error" role="alert"><p>{err}</p></div>}
        <button className="btn btn--ink btn--xl btn--block" disabled={busy} aria-busy={busy}>
          {busy ? <><span className="spinner" aria-hidden /> LOOKING…</> : "FIND MY RESERVATION"}
        </button>
      </form>

      {found && (
        <section className="found" aria-live="polite" aria-label="Your reservations">
          <h2 className="found__title">YOUR RESERVATIONS · TAP ONE TO OPEN ITS TICKET</h2>
          {found.map((r) => (
            <Link key={r.reservationId} href={r.url} className="found__card" data-status={r.status}>
              <span className="found__burger">{r.burgerName} × {r.quantity}</span>
              <span className="found__id">{r.reservationId}</span>
              <span className="found__meta">{longDate(r.date).replace(/, \d{4}$/, "")} · {formatPrice(r.total)} · <span className="found__status" data-status={r.status}>{LABEL[r.status]}</span></span>
            </Link>
          ))}
        </section>
      )}
    </>
  );
}
