"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { MESSAGES } from "@/lib/messages";

export function LookupForm() {
  const router = useRouter();
  const uid = useId();
  const [id, setId] = useState("");
  const [mobile, setMobile] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setErr("");
    try {
      const res = await fetch("/api/reservations/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reservationId: id, mobile }),
      });
      const out = await res.json().catch(() => null);
      if (res.ok && out?.url) {
        router.push(out.url);
        return;
      }
      setErr(out?.message ?? MESSAGES.SERVER);
    } catch {
      setErr(MESSAGES.SERVER);
    }
    setBusy(false);
  }

  return (
    <form onSubmit={submit} className="form form--lookup" noValidate>
      <div className="field">
        <label htmlFor={`${uid}-id`}>RESERVATION ID</label>
        <input id={`${uid}-id`} value={id} onChange={(e) => setId(e.target.value.toUpperCase())} placeholder="AF-XXXXXX" autoCapitalize="characters" autoComplete="off" maxLength={12} required />
      </div>
      <div className="field">
        <label htmlFor={`${uid}-m`}>MOBILE NUMBER</label>
        <div className="field__phone">
          <span aria-hidden>+91</span>
          <input id={`${uid}-m`} type="tel" inputMode="numeric" autoComplete="tel-national" value={mobile} onChange={(e) => setMobile(e.target.value.replace(/[^\d+\s-]/g, ""))} placeholder="98765 43210" maxLength={16} required />
        </div>
      </div>
      {err && <div className="form__error" role="alert"><p>{err}</p></div>}
      <button className="btn btn--ink btn--xl btn--block" disabled={busy} aria-busy={busy}>
        {busy ? <><span className="spinner" aria-hidden /> LOOKING…</> : "FIND MY RESERVATION"}
      </button>
    </form>
  );
}
