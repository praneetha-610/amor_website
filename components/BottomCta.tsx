"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { BURGER_KEYS, getBurger } from "@/config/site";

/** Persistent thumb-reach CTA on mobile. Hides while the booking form itself is on screen. */
export function BottomCta() {
  const pathname = usePathname();
  const [hide, setHide] = useState(false);

  const burgerPath = BURGER_KEYS.map(getBurger).find((b) => b.path === pathname);
  const suppressed = pathname.startsWith("/reserve") || pathname.startsWith("/my-reservation");

  useEffect(() => {
    setHide(false);
    // hide while any element marked data-cta-hide (hero buttons, booking form, final CTA, footer) is on screen
    const els = [...document.querySelectorAll("[data-cta-hide]"), ...(document.getElementById("claim") ? [document.getElementById("claim")!] : [])];
    if (!els.length || !("IntersectionObserver" in window)) return;
    const visible = new Set<Element>();
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) (e.isIntersecting ? visible.add(e.target) : visible.delete(e.target));
      setHide(visible.size > 0);
    }, { threshold: 0 });
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [pathname]);

  if (suppressed) return null;
  return (
    <div className="bottom-cta" data-hide={hide} aria-hidden={hide}>
      <Link
        href={burgerPath ? `${burgerPath.path}#claim` : "/reserve"}
        className="btn btn--bottom btn--lg btn--block"
        tabIndex={hide ? -1 : 0}
      >
        CLAIM YOUR BURGER <span aria-hidden>→</span>
      </Link>
    </div>
  );
}
