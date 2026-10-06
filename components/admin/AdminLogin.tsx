"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function AdminLogin({ demoHint, configured }: { demoHint: boolean; configured: boolean }) {
  const router = useRouter();
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [show, setShow] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setErr("");
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: pw }),
      });
      const out = await res.json().catch(() => null);
      if (res.ok) {
        router.refresh();
        return;
      }
      setErr(out?.message ?? "Something went wrong. Please try again.");
    } catch {
      setErr("Something went wrong. Please try again.");
    }
    setBusy(false);
  }

  return (
    <main className="admin admin--login">
      <form onSubmit={submit} className="admin-login">
        <p className="admin__brand">AMOR FATI · STAFF</p>
        <h1>SIGN IN</h1>
        {!configured ? (
          <p className="form__error" role="alert">Admin is disabled: set ADMIN_PASSWORD in the environment.</p>
        ) : (
          <>
            {demoHint && <p className="admin-note">Demo mode: the password is <code>demo</code> (set ADMIN_PASSWORD to change it).</p>}
            <label htmlFor="pw">PASSWORD</label>
            <div className="admin-login__pw">
              <input id="pw" type={show ? "text" : "password"} autoComplete="current-password" autoCapitalize="none" autoCorrect="off" value={pw} onChange={(e) => setPw(e.target.value)} required autoFocus />
              <button type="button" onClick={() => setShow((v) => !v)} aria-pressed={show}>{show ? "HIDE" : "SHOW"}</button>
            </div>
            {err && <p className="form__error" role="alert">{err}</p>}
            <button className="btn btn--ink btn--xl btn--block" disabled={busy}>{busy ? "SIGNING IN…" : "SIGN IN"}</button>
          </>
        )}
      </form>
    </main>
  );
}
