"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { siteConfig } from "@/config/site";

const LINKS = [
  { href: "/#drops", label: "THE DROPS" },
  { href: "/#about", label: "ABOUT" },
  { href: "/my-reservation", label: "MY RESERVATION" },
];

export function Nav() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <header className="nav" data-open={open}>
      <div className="nav__bar">
        <Link href="/" className="nav__logo" aria-label={`${siteConfig.brandName} — home`}>
          {siteConfig.brandName}
        </Link>

        <nav className="nav__links" aria-label="Primary">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href}>{l.label}</Link>
          ))}
        </nav>

        <Link href="/reserve" className="btn btn--ink btn--sm nav__cta">CLAIM YOURS</Link>

        <button
          type="button"
          className="nav__menu"
          aria-expanded={open}
          aria-controls="mobile-menu"
          aria-label={open ? "Close menu" : "Open menu"}
          onClick={() => setOpen((o) => !o)}
        >
          <span aria-hidden />
          <span aria-hidden />
        </button>
      </div>

      <div id="mobile-menu" className="nav__sheet" hidden={!open}>
        <nav aria-label="Mobile">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href}>{l.label}</Link>
          ))}
          <Link href="/reserve" className="btn btn--accent btn--lg">CLAIM YOUR BURGER</Link>
        </nav>
        <div className="nav__sheet-info">
          <p>{siteConfig.location.line2} · {siteConfig.location.hours}</p>
          <p>
            <a href={`tel:${siteConfig.phoneTel}`}>{siteConfig.phoneNumber}</a>
            {" · "}
            <a href={siteConfig.instagramURL} target="_blank" rel="noopener noreferrer">{siteConfig.instagramHandle}</a>
          </p>
        </div>
      </div>
    </header>
  );
}
